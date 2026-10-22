import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, parseKey } from '@/lib/crypto/secret';
import { planRunRecord, type RunDb } from './run';
import type { CampaignRecord, SyncStore } from './sync';

const CHUNK = 500;
const chunks = <T,>(list: T[]): T[][] => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

const fail = (what: string) => new Error(`falha ao ${what}`);

export function supabaseSyncStore(admin: SupabaseClient, userId: string): SyncStore {
  return {
    async campaignsOfAccount(adAccountId) {
      const { data, error } = await admin
        .from('campaigns')
        .select('id, meta_campaign_id, offer_id')
        .eq('user_id', userId)
        .eq('ad_account_id', adAccountId)
        .limit(5000);
      if (error) throw fail('ler campanhas');
      return (data ?? []).map((c) => ({ id: c.id, metaCampaignId: c.meta_campaign_id, offerId: c.offer_id }));
    },

    async upsertCampaigns(adAccountId, rows) {
      const out: CampaignRecord[] = [];
      for (const part of chunks(rows)) {
        const { data, error } = await admin
          .from('campaigns')
          .upsert(
            part.map((r) => ({
              user_id: userId,
              ad_account_id: adAccountId,
              meta_campaign_id: r.metaCampaignId,
              name: r.name,
              status: r.status,
              daily_budget_cents: r.dailyBudgetCents,
              offer_id: r.offerId,
            })),
            { onConflict: 'user_id,meta_campaign_id' },
          )
          .select('id, meta_campaign_id, offer_id');
        if (error) throw fail('gravar campanhas');
        out.push(...(data ?? []).map((c) => ({ id: c.id, metaCampaignId: c.meta_campaign_id, offerId: c.offer_id })));
      }
      return out;
    },

    async upsertAdsets(rows) {
      const out: Array<{ id: string; metaId: string }> = [];
      for (const part of chunks(rows)) {
        const { data, error } = await admin
          .from('adsets')
          .upsert(
            part.map((r) => ({ user_id: userId, campaign_id: r.campaignId, meta_adset_id: r.metaAdsetId, name: r.name, status: r.status })),
            { onConflict: 'user_id,meta_adset_id' },
          )
          .select('id, meta_adset_id');
        if (error) throw fail('gravar conjuntos');
        out.push(...(data ?? []).map((a) => ({ id: a.id as string, metaId: a.meta_adset_id as string })));
      }
      return out;
    },

    async upsertAds(rows) {
      const out: Array<{ id: string; metaId: string }> = [];
      for (const part of chunks(rows)) {
        const { data, error } = await admin
          .from('ads')
          .upsert(
            part.map((r) => ({ user_id: userId, adset_id: r.adsetId, meta_ad_id: r.metaAdId, name: r.name, status: r.status })),
            { onConflict: 'user_id,meta_ad_id' },
          )
          .select('id, meta_ad_id');
        if (error) throw fail('gravar anúncios');
        out.push(...(data ?? []).map((a) => ({ id: a.id as string, metaId: a.meta_ad_id as string })));
      }
      return out;
    },

    async upsertMetrics(rows, syncedAt) {
      for (const part of chunks(rows)) {
        const { error } = await admin.from('daily_metrics').upsert(
          part.map((r) => ({
            user_id: userId,
            offer_id: r.offerId,
            level: r.level,
            entity_id: r.entityId,
            date: r.date,
            spend_cents: r.spendCents,
            impressions: r.impressions,
            reach: r.reach,
            link_clicks: r.linkClicks,
            landing_page_views: r.landingPageViews,
            video_views_3s: r.videoViews3s,
            checkouts_initiated: r.checkoutsInitiated,
            meta_purchases: r.metaPurchases,
            meta_purchase_value_cents: r.metaPurchaseValueCents,
            synced_at: syncedAt,
          })),
          { onConflict: 'user_id,level,entity_id,date' },
        );
        if (error) throw fail('gravar métricas');
      }
    },
  };
}

export function supabaseRunDb(admin: SupabaseClient): RunDb {
  return {
    async connection(userId) {
      const conn = await admin
        .from('meta_connections')
        .select('id, expires_at')
        .eq('user_id', userId)
        .eq('status', 'conectado')
        .order('created_at', { ascending: false })
        .limit(1);
      const row = conn.data?.[0];
      if (conn.error || !row) return null;
      const secret = await admin.from('connection_secrets').select('ciphertext').eq('meta_connection_id', row.id).eq('user_id', userId).maybeSingle();
      if (secret.error || !secret.data) return null;
      const accounts = await admin
        .from('ad_accounts')
        .select('id, meta_account_id, currency')
        .eq('meta_connection_id', row.id)
        .eq('user_id', userId)
        .eq('selected', true);
      if (accounts.error) throw fail('ler contas');
      return {
        id: row.id as string,
        expiresAt: row.expires_at as string | null,
        token: decryptSecret(secret.data.ciphertext, parseKey(process.env.TOKEN_ENCRYPTION_KEY)),
        accounts: (accounts.data ?? []).map((a) => ({ id: a.id, metaAccountId: a.meta_account_id, currency: a.currency })),
      };
    },

    async lastRunStartedAt(userId) {
      const { data } = await admin
        .from('sync_runs')
        .select('started_at, finished_at')
        .eq('user_id', userId)
        .eq('source', 'Meta Ads')
        .order('started_at', { ascending: false })
        .limit(1);
      // O fim da última execução (leituras leves atualizam a mesma linha), senão o início.
      return data?.[0]?.finished_at ?? data?.[0]?.started_at ?? null;
    },

    async recordRun(userId, run) {
      const { data: latest } = await admin
        .from('sync_runs')
        .select('id, ok, error')
        .eq('user_id', userId)
        .eq('source', 'Meta Ads')
        .order('started_at', { ascending: false })
        .limit(1);
      const last = latest?.[0];
      if (last && planRunRecord({ ok: last.ok, error: last.error }, run) === 'update') {
        const { error } = await admin.from('sync_runs').update({ finished_at: run.finishedAt, ok: run.ok, error: run.error }).eq('id', last.id).eq('user_id', userId);
        if (error) throw fail('registrar a sincronização');
        return;
      }
      const { error } = await admin.from('sync_runs').insert({
        user_id: userId,
        source: 'Meta Ads',
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        ok: run.ok,
        delay_seconds: 0,
        error: run.error,
      });
      if (error) throw fail('registrar a sincronização');
    },

    async markDisconnected(userId, connectionId) {
      await admin.from('connection_secrets').delete().eq('meta_connection_id', connectionId).eq('user_id', userId);
      await admin.from('meta_connections').update({ status: 'desconectado' }).eq('id', connectionId).eq('user_id', userId);
    },

    storeFor: (userId) => supabaseSyncStore(admin, userId),
  };
}

/** Usuários com Meta conectado e ao menos uma conta escolhida (para o agendador). */
export async function usersToSync(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from('ad_accounts').select('user_id').eq('selected', true).limit(5000);
  if (error) throw fail('listar usuários');
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}
