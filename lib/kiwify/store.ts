import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret, parseKey } from '@/lib/crypto/secret';
import type { KiwifyCredentials } from './client';
import type { OrderStatus } from './orders';
import type { KiwifyRunDb } from './run';
import type { OrderStore, OrderUpsert } from './sync';

const SOURCE = 'Kiwify';
const CHUNK = 500;
const fail = (what: string) => new Error(`falha ao ${what}`);
const key = () => parseKey(process.env.TOKEN_ENCRYPTION_KEY);

/** O que fica cifrado em connection_secrets. `webhookId` serve para apagar o webhook ao desconectar. */
export interface StoredKiwifySecret extends KiwifyCredentials {
  webhookId: string | null;
}

export const sealKiwifySecret = (secret: StoredKiwifySecret) => encryptSecret(JSON.stringify(secret), key());

export function openKiwifySecret(ciphertext: string): StoredKiwifySecret {
  const raw = JSON.parse(decryptSecret(ciphertext, key())) as Partial<StoredKiwifySecret>;
  if (!raw.clientId || !raw.clientSecret || !raw.accountId) throw new Error('credencial ilegível');
  return { clientId: raw.clientId, clientSecret: raw.clientSecret, accountId: raw.accountId, webhookId: raw.webhookId ?? null };
}

export function supabaseOrderStore(admin: SupabaseClient, userId: string, connectionId: string): OrderStore {
  return {
    async offerIdsByProduct() {
      const { data, error } = await admin
        .from('offers')
        .select('id, sales_product_id')
        .eq('user_id', userId)
        .eq('sales_platform', 'Kiwify')
        .not('sales_product_id', 'is', null)
        .neq('status', 'arquivada');
      if (error) throw fail('ler ofertas');
      return new Map((data ?? []).map((o) => [o.sales_product_id as string, o.id as string]));
    },

    async metaEntities(campaignMetaIds, adMetaIds) {
      const campaigns = new Map<string, string>();
      const ads = new Map<string, string>();
      if (campaignMetaIds.length > 0) {
        const { data, error } = await admin.from('campaigns').select('id, meta_campaign_id').eq('user_id', userId).in('meta_campaign_id', campaignMetaIds);
        if (error) throw fail('ler campanhas');
        for (const c of data ?? []) campaigns.set(c.meta_campaign_id, c.id);
      }
      if (adMetaIds.length > 0) {
        const { data, error } = await admin.from('ads').select('id, meta_ad_id').eq('user_id', userId).in('meta_ad_id', adMetaIds);
        if (error) throw fail('ler anúncios');
        for (const a of data ?? []) ads.set(a.meta_ad_id, a.id);
      }
      return { campaigns, ads };
    },

    async previousStatuses(ids) {
      const out = new Map<string, OrderStatus>();
      // Ids na URL do PostgREST: lotes pequenos para não estourar o tamanho da requisição.
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await admin
          .from('orders')
          .select('platform_order_id, status')
          .eq('user_id', userId)
          .eq('sales_connection_id', connectionId)
          .in('platform_order_id', ids.slice(i, i + 100));
        if (error) throw fail('ler pedidos');
        for (const o of data ?? []) out.set(o.platform_order_id as string, o.status as OrderStatus);
      }
      return out;
    },

    async upsertOrders(rows: OrderUpsert[]) {
      // A paginação pode repetir um pedido; o banco recusa duas linhas iguais no mesmo comando.
      const unique = [...new Map(rows.map((r) => [r.platformOrderId, r])).values()];
      for (let i = 0; i < unique.length; i += CHUNK) {
        const { error } = await admin.from('orders').upsert(
          unique.slice(i, i + CHUNK).map((r) => ({
            user_id: userId,
            offer_id: r.offerId,
            sales_connection_id: connectionId,
            platform_order_id: r.platformOrderId,
            payment_method: r.paymentMethod,
            status: r.status,
            amount_cents: r.amountCents,
            refunded_cents: r.refundedCents,
            approved_at: r.approvedAt,
            refunded_at: r.refundedAt,
            utm_source: r.utm.source,
            utm_medium: r.utm.medium,
            utm_campaign: r.utm.campaign,
            utm_content: r.utm.content,
            utm_term: r.utm.term,
            campaign_id: r.campaignId,
            ad_id: r.adId,
          })),
          { onConflict: 'user_id,sales_connection_id,platform_order_id' },
        );
        if (error) throw fail('gravar pedidos');
      }
    },
  };
}

export function supabaseKiwifyRunDb(admin: SupabaseClient): KiwifyRunDb {
  return {
    async connection(userId) {
      const conn = await admin
        .from('sales_connections')
        .select('id, last_synced_at')
        .eq('user_id', userId)
        .eq('platform', 'Kiwify')
        .eq('status', 'conectado')
        .limit(1);
      const row = conn.data?.[0];
      if (conn.error || !row) return null;
      const secret = await admin.from('connection_secrets').select('ciphertext').eq('sales_connection_id', row.id).eq('user_id', userId).maybeSingle();
      if (secret.error || !secret.data) return null;
      const { clientId, clientSecret, accountId } = openKiwifySecret(secret.data.ciphertext);
      return { id: row.id as string, lastSyncedAt: row.last_synced_at as string | null, credentials: { clientId, clientSecret, accountId } };
    },

    async lastRunStartedAt(userId) {
      const { data } = await admin.from('sync_runs').select('started_at').eq('user_id', userId).eq('source', SOURCE).order('started_at', { ascending: false }).limit(1);
      return data?.[0]?.started_at ?? null;
    },

    async recordRun(userId, run) {
      const { error } = await admin.from('sync_runs').insert({
        user_id: userId,
        source: SOURCE,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        ok: run.ok,
        delay_seconds: 0,
        error: run.error,
      });
      if (error) throw fail('registrar a sincronização');
    },

    async markError(userId, connectionId) {
      await admin.from('sales_connections').update({ status: 'erro' }).eq('id', connectionId).eq('user_id', userId);
    },

    async markSynced(userId, connectionId, at) {
      const { error } = await admin.from('sales_connections').update({ last_synced_at: at }).eq('id', connectionId).eq('user_id', userId);
      if (error) throw fail('gravar a leitura');
    },

    storeFor: (userId, connectionId) => supabaseOrderStore(admin, userId, connectionId),
  };
}

/** Usuários com a Kiwify conectada (para o agendador). */
export async function kiwifyUsers(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from('sales_connections').select('user_id').eq('platform', 'Kiwify').eq('status', 'conectado').limit(5000);
  if (error) throw fail('listar usuários');
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}
