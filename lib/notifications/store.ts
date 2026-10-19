import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saoPauloDate, addDays } from '@/lib/data/dates';
import type { NotifyDeps } from './dispatch';
import { DEFAULT_PREFERENCES, type Preferences, type SummaryData, type SummarySlot } from './format';
import { sendPush } from './push';

const fail = (what: string) => new Error(`falha ao ${what}`);

/** Implementação de produção: banco com a chave de serviço, sempre filtrando por user_id. */
export function supabaseNotifyDeps(admin: SupabaseClient): NotifyDeps {
  return {
    async preferences(userId) {
      const { data, error } = await admin.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
      if (error) throw fail('ler preferências');
      return data ? ({ ...DEFAULT_PREFERENCES, ...pick(data) } as Preferences) : DEFAULT_PREFERENCES;
    },

    async devices(userId) {
      const { data, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
      if (error) throw fail('ler aparelhos');
      return (data ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>;
    },

    async offerNames(userId, offerIds) {
      const { data, error } = await admin.from('offers').select('id, name').eq('user_id', userId).in('id', offerIds);
      if (error) throw fail('ler ofertas');
      return new Map((data ?? []).map((o) => [o.id as string, o.name as string]));
    },

    async insertNew(userId, items) {
      // ignoreDuplicates: a chave (user_id, dedupe_key) já existente não devolve linha, então só o que é novo é enviado.
      const { data, error } = await admin
        .from('notifications')
        .upsert(
          items.map((i) => ({ user_id: userId, kind: i.kind, dedupe_key: i.dedupeKey, title: i.title, body: i.body, url: i.url })),
          { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
        )
        .select('id, dedupe_key');
      if (error) throw fail('gravar avisos');
      return (data ?? []).map((r) => ({ id: r.id as string, dedupeKey: r.dedupe_key as string }));
    },

    async markSent(id, sent, errorCode) {
      await admin.from('notifications').update({ sent_at: sent ? new Date().toISOString() : null, error: errorCode }).eq('id', id);
    },

    async removeDevice(deviceId) {
      await admin.from('push_subscriptions').delete().eq('id', deviceId);
    },

    push: sendPush,
  };
}

function pick(row: Record<string, unknown>): Partial<Preferences> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) if (typeof row[key] === 'boolean') out[key] = row[key] as boolean;
  return out as Partial<Preferences>;
}

/** Período de cada resumo, em dias de America/Sao_Paulo. */
export function summaryDay(slot: SummarySlot, now: Date): string {
  const today = saoPauloDate(now);
  return slot === 'manha' ? addDays(today, -1) : today;
}

/**
 * Números do resumo de um usuário. Lê as views por dia com o filtro explícito de user_id (a chave de serviço ignora a RLS).
 * Lucro e ROAS real só contam ofertas com a plataforma conectada e o produto ligado, como nas telas.
 */
export async function collectSummary(admin: SupabaseClient, userId: string, slot: SummarySlot, now: Date): Promise<SummaryData> {
  const day = summaryDay(slot, now);

  const [offers, connections, metrics, sales, pix] = await Promise.all([
    admin.from('offers').select('id, sales_platform, sales_product_id').eq('user_id', userId).neq('status', 'arquivada'),
    admin.from('sales_connections').select('platform').eq('user_id', userId).eq('status', 'conectado'),
    admin.from('offer_daily_metrics').select('offer_id, spend_cents').eq('user_id', userId).eq('date', day),
    admin.from('offer_daily_sales').select('offer_id, approved_orders, approved_revenue_cents, refunded_cents').eq('user_id', userId).eq('date', day),
    admin
      .from('orders')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('status', 'pendente')
      .eq('payment_method', 'pix')
      .gte('created_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString()),
  ]);
  for (const r of [offers, connections, metrics, sales, pix]) if (r.error) throw fail('ler dados do resumo');

  const platforms = new Set((connections.data ?? []).map((c) => c.platform as string));
  const connectedOffers = new Set(
    (offers.data ?? []).filter((o) => platforms.has(o.sales_platform as string) && o.sales_product_id).map((o) => o.id as string),
  );

  const num = (v: unknown) => Number(v ?? 0);
  const data: SummaryData = {
    spendCents: 0,
    approvedOrders: 0,
    revenueCents: 0,
    refundedCents: 0,
    pixPendingOrders: (pix.data ?? []).length,
    pixPendingCents: (pix.data ?? []).reduce((a, r) => a + num(r.amount_cents), 0),
    connected: { offers: connectedOffers.size, spendCents: 0, revenueCents: 0, refundedCents: 0 },
    totalOffers: (offers.data ?? []).length,
  };
  for (const m of metrics.data ?? []) {
    data.spendCents += num(m.spend_cents);
    if (connectedOffers.has(m.offer_id as string)) data.connected.spendCents += num(m.spend_cents);
  }
  for (const s of sales.data ?? []) {
    data.approvedOrders += num(s.approved_orders);
    data.revenueCents += num(s.approved_revenue_cents);
    data.refundedCents += num(s.refunded_cents);
    if (connectedOffers.has(s.offer_id as string)) {
      data.connected.revenueCents += num(s.approved_revenue_cents);
      data.connected.refundedCents += num(s.refunded_cents);
    }
  }
  return data;
}

/** Usuários com ao menos um aparelho inscrito (para o agendador dos resumos). */
export async function usersWithDevices(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from('push_subscriptions').select('user_id').limit(5000);
  if (error) throw fail('listar usuários');
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}
