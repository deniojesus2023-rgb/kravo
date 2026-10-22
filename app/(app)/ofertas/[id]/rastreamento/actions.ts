'use server';

import { revalidatePath } from 'next/cache';
import { buildCapiEvent } from '@/lib/capi/event';
import { createCapi, capiErrorKind } from '@/lib/capi/graph';
import { buildUserData } from '@/lib/capi/hash';
import { openCapiToken, sealCapiToken } from '@/lib/capi/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type PixelState = { ok?: string; error?: string } | undefined;

const text = (d: FormData, k: string) => String(d.get(k) ?? '').trim();

/** Confere login e dono da oferta. As gravações usam o cliente administrativo sempre com o user_id explícito. */
async function owner(offerId: string) {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: offer } = await supabase.from('offers').select('id').eq('id', offerId).maybeSingle();
  return offer ? { admin, user: auth.user } : null;
}

export async function savePixel(offerId: string, _: PixelState, data: FormData): Promise<PixelState> {
  const ctx = await owner(offerId);
  if (!ctx) return { error: 'Não foi possível confirmar sua sessão. Entre de novo.' };
  const pixelId = text(data, 'pixelId');
  const token = text(data, 'token');
  const testCode = text(data, 'testCode');
  if (!/^[0-9]{8,20}$/.test(pixelId)) return { error: 'O ID do pixel tem só números (de 8 a 20 dígitos).' };
  if (testCode && !/^[A-Za-z0-9_-]{3,40}$/.test(testCode)) return { error: 'Código de teste inválido. Copie-o de "Eventos de teste" no Gerenciador de Eventos.' };
  const { admin, user } = ctx;

  const { data: existing } = await admin.from('offer_pixels').select('offer_id, pixel_id').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle();
  const hasToken = existing ? Boolean((await admin.from('connection_secrets').select('id').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle()).data) : false;
  if (!token && !hasToken) return { error: 'Cole o token de acesso da API de Conversões.' };

  // Trocar de pixel desliga o envio: a confirmação de duplicidade valia para o pixel anterior.
  const changed = existing && existing.pixel_id !== pixelId;
  const row = { offer_id: offerId, user_id: user.id, pixel_id: pixelId, test_event_code: testCode || null, updated_at: new Date().toISOString(), ...(token || changed ? { status: 'novo' } : {}), ...(changed ? { capi_enabled: false } : {}) };
  const up = await admin.from('offer_pixels').upsert(row, { onConflict: 'offer_id' });
  if (up.error) return { error: 'Não foi possível salvar o pixel agora.' };
  if (token) {
    await admin.from('connection_secrets').delete().eq('offer_id', offerId).eq('user_id', user.id);
    const ins = await admin.from('connection_secrets').insert({ user_id: user.id, offer_id: offerId, ciphertext: sealCapiToken(token) });
    if (ins.error) return { error: 'Não foi possível guardar o token com segurança.' };
  }
  revalidatePath(`/ofertas/${offerId}/rastreamento`);
  return { ok: 'Pixel salvo. O envio continua desligado até você confirmar abaixo.' };
}

export async function toggleCapi(offerId: string, _: PixelState, data: FormData): Promise<PixelState> {
  const ctx = await owner(offerId);
  if (!ctx) return { error: 'Não foi possível confirmar sua sessão. Entre de novo.' };
  const { admin, user } = ctx;
  const turnOn = text(data, 'enable') === '1';
  if (turnOn) {
    if (text(data, 'confirm') !== 'on') return { error: 'Confirme que o Purchase do pixel do checkout está desligado (ou usa o mesmo ID do pedido).' };
    const { data: pixel } = await admin.from('offer_pixels').select('status').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle();
    const { data: secret } = await admin.from('connection_secrets').select('id').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle();
    if (!pixel || !secret) return { error: 'Salve o pixel e o token antes de ligar o envio.' };
    if (pixel.status === 'token_invalido') return { error: 'O Meta recusou o token. Gere outro e salve de novo.' };
  }
  const { error } = await admin.from('offer_pixels').update({ capi_enabled: turnOn, updated_at: new Date().toISOString() }).eq('offer_id', offerId).eq('user_id', user.id);
  if (error) return { error: 'Não foi possível alterar o envio agora.' };
  revalidatePath(`/ofertas/${offerId}/rastreamento`);
  return { ok: turnOn ? 'Envio ligado. Novas vendas aprovadas desta oferta seguem para o Meta.' : 'Envio desligado.' };
}

/** Evento de teste com o seu próprio e-mail (em hash). Só aparece em "Eventos de teste": exige o código de teste. */
export async function testPixel(offerId: string): Promise<PixelState> {
  const ctx = await owner(offerId);
  if (!ctx) return { error: 'Não foi possível confirmar sua sessão. Entre de novo.' };
  const { admin, user } = ctx;
  const { data: pixel } = await admin.from('offer_pixels').select('pixel_id, test_event_code').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle();
  const { data: secret } = await admin.from('connection_secrets').select('ciphertext').eq('offer_id', offerId).eq('user_id', user.id).maybeSingle();
  if (!pixel || !secret) return { error: 'Salve o pixel e o token primeiro.' };
  if (!pixel.test_event_code) return { error: 'Informe o código de "Eventos de teste" para testar sem afetar seus dados.' };
  try {
    const now = new Date();
    const event = buildCapiEvent({ eventName: 'Purchase', orderId: `teste-${now.getTime()}`, eventId: `teste-${now.getTime()}`, eventTime: now.toISOString(), valueCents: 100, userData: buildUserData({ email: user.email ?? null }), offerName: 'Teste trakfy', sourceUrl: null });
    await createCapi().sendEvents({ pixelId: pixel.pixel_id, token: openCapiToken(secret.ciphertext), events: [event], testEventCode: pixel.test_event_code });
    await admin.from('offer_pixels').update({ status: 'ok', last_ok_at: now.toISOString() }).eq('offer_id', offerId).eq('user_id', user.id);
    revalidatePath(`/ofertas/${offerId}/rastreamento`);
    return { ok: 'Evento de teste enviado. Confira em "Eventos de teste" no Gerenciador de Eventos.' };
  } catch (e) {
    const kind = capiErrorKind(e);
    if (kind === 'token_invalido') {
      await admin.from('offer_pixels').update({ status: 'token_invalido' }).eq('offer_id', offerId).eq('user_id', user.id);
      return { error: 'O Meta recusou o token. Gere outro no Gerenciador de Eventos.' };
    }
    return { error: kind === 'dados_invalidos' ? 'O Meta recusou o evento. Confira o ID do pixel.' : 'O Meta não respondeu agora. Tente de novo em instantes.' };
  }
}

export async function removePixel(offerId: string): Promise<PixelState> {
  const ctx = await owner(offerId);
  if (!ctx) return { error: 'Não foi possível confirmar sua sessão. Entre de novo.' };
  const { error } = await ctx.admin.from('offer_pixels').delete().eq('offer_id', offerId).eq('user_id', ctx.user.id);
  if (error) return { error: 'Não foi possível remover agora.' };
  revalidatePath(`/ofertas/${offerId}/rastreamento`);
  return { ok: 'Pixel removido.' };
}
