import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret, parseKey } from '@/lib/crypto/secret';
import type { HashedUserData } from './hash';
import type { CapiStore, NewCapiRow, PixelConfig, QueueRow } from './queue';

const fail = (what: string) => new Error(`falha ao ${what}`);
const key = () => parseKey(process.env.TOKEN_ENCRYPTION_KEY);

/** O token da API de Conversões fica cifrado, como as demais credenciais. */
export const sealCapiToken = (token: string) => encryptSecret(JSON.stringify({ kind: 'capi', token }), key());

export function openCapiToken(ciphertext: string): string {
  const raw = JSON.parse(decryptSecret(ciphertext, key())) as { kind?: string; token?: string };
  if (raw.kind !== 'capi' || !raw.token) throw new Error('credencial ilegível');
  return raw.token;
}

/** Sempre filtra por usuário: o cliente administrativo ignora a RLS. */
export function supabaseCapiStore(admin: SupabaseClient): CapiStore {
  return {
    async pixelConfigs(userId, offerIds) {
      const out = new Map<string, PixelConfig>();
      if (offerIds.length === 0) return out;
      const { data, error } = await admin.from('offer_pixels').select('offer_id, pixel_id, capi_enabled, test_event_code').eq('user_id', userId).in('offer_id', offerIds);
      if (error) throw fail('ler pixels');
      for (const p of data ?? []) out.set(p.offer_id, { offerId: p.offer_id, pixelId: p.pixel_id, enabled: p.capi_enabled, testCode: p.test_event_code });
      return out;
    },

    async insertEvents(rows: NewCapiRow[]) {
      if (rows.length === 0) return;
      const { error } = await admin.from('capi_events').upsert(
        rows.map((r) => ({
          user_id: r.userId,
          offer_id: r.offerId,
          platform_order_id: r.platformOrderId,
          event_name: r.eventName,
          event_id: r.eventId,
          event_time: r.eventTime,
          value_cents: r.valueCents,
          user_data: r.userData,
          test: r.test,
        })),
        { onConflict: 'user_id,offer_id,event_name,event_id', ignoreDuplicates: true },
      );
      if (error) throw fail('guardar eventos');
    },

    async due(userId, now, limit) {
      let q = admin.from('capi_events').select('id, user_id, offer_id, platform_order_id, event_name, event_id, event_time, value_cents, user_data, test, attempts, created_at').eq('status', 'pendente').lte('next_attempt_at', now.toISOString());
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q.order('next_attempt_at').limit(limit);
      if (error) throw fail('ler a fila');
      return (data ?? []).map((r): QueueRow => ({
        id: r.id,
        userId: r.user_id,
        offerId: r.offer_id,
        platformOrderId: r.platform_order_id,
        eventName: r.event_name,
        eventId: r.event_id,
        eventTime: r.event_time,
        valueCents: Number(r.value_cents),
        userData: r.user_data as HashedUserData,
        test: r.test,
        attempts: r.attempts,
        createdAt: r.created_at,
      }));
    },

    async offerInfo(userId, offerIds) {
      const out = new Map<string, { name: string; checkoutUrl: string | null }>();
      const { data, error } = await admin.from('offers').select('id, name, checkout_url').eq('user_id', userId).in('id', offerIds);
      if (error) throw fail('ler ofertas');
      for (const o of data ?? []) out.set(o.id, { name: o.name, checkoutUrl: o.checkout_url });
      return out;
    },

    async token(userId, offerId) {
      const { data, error } = await admin.from('connection_secrets').select('ciphertext').eq('offer_id', offerId).eq('user_id', userId).maybeSingle();
      if (error) throw fail('ler credencial');
      if (!data) return null;
      try {
        return openCapiToken(data.ciphertext);
      } catch {
        return null;
      }
    },

    async settle(updates) {
      for (const u of updates) {
        const { error } = await admin
          .from('capi_events')
          .update({ status: u.status, attempts: u.attempts, last_error: u.error ?? null, ...(u.nextAttemptAt ? { next_attempt_at: u.nextAttemptAt } : {}), ...(u.sentAt ? { sent_at: u.sentAt } : {}) })
          .eq('id', u.id);
        if (error) throw fail('atualizar evento');
      }
    },

    async setPixelStatus(userId, offerId, status, at) {
      const { error } = await admin
        .from('offer_pixels')
        .update({ status, updated_at: at, ...(status === 'ok' ? { last_ok_at: at } : {}) })
        .eq('offer_id', offerId)
        .eq('user_id', userId);
      if (error) throw fail('atualizar pixel');
    },
  };
}
