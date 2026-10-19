'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { notifyMessage } from '@/lib/notifications/dispatch';
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/notifications/format';
import { supabaseNotifyDeps } from '@/lib/notifications/store';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function currentUser() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  return supabase && user ? { supabase, user } : null;
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Guarda o aparelho que aceitou receber notificações. O endpoint só vale se for HTTPS e as chaves tiverem o formato do navegador. */
export async function saveDevice(input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<{ error?: string }> {
  const session = await currentUser();
  if (!session) return { error: 'Entre na sua conta para continuar.' };
  const admin = createAdminClient();
  if (!admin) return { error: 'As notificações ainda não estão configuradas neste ambiente.' };

  const { endpoint, p256dh, auth } = input;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2000) return { error: 'Aparelho inválido.' };
  if (!B64URL.test(p256dh) || p256dh.length < 20 || p256dh.length > 200 || !B64URL.test(auth) || auth.length < 10 || auth.length > 100) {
    return { error: 'Aparelho inválido.' };
  }
  // O mesmo aparelho pode trocar de conta: o endpoint é único e passa a pertencer ao usuário da sessão.
  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      { user_id: session.user.id, endpoint, p256dh, auth, user_agent: (input.userAgent ?? '').slice(0, 300) || null },
      { onConflict: 'endpoint' },
    );
  if (error) return { error: 'Não foi possível salvar este aparelho agora.' };
  revalidatePath('/configuracoes');
  return {};
}

export async function removeDevice(endpoint: string): Promise<{ error?: string }> {
  const session = await currentUser();
  if (!session) return { error: 'Entre na sua conta para continuar.' };
  // A RLS limita ao aparelho do próprio usuário.
  const { error } = await session.supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return { error: 'Não foi possível remover este aparelho agora.' };
  revalidatePath('/configuracoes');
  return {};
}

const PREFERENCE_FIELDS = Object.keys(DEFAULT_PREFERENCES) as Array<keyof Preferences>;

export async function savePreferences(data: FormData): Promise<void> {
  const session = await currentUser();
  if (!session) redirect('/login?next=/configuracoes');
  // Caixa de seleção desmarcada não vem no formulário: ausente = desligado.
  const row = Object.fromEntries(PREFERENCE_FIELDS.map((key) => [key, data.get(key) === 'on'])) as Record<keyof Preferences, boolean>;
  const { error } = await session.supabase
    .from('notification_preferences')
    .upsert({ user_id: session.user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  redirect(`/configuracoes?${error ? 'erro=preferencias' : 'salvo=1'}`);
}

/** Manda uma notificação de teste a todos os aparelhos do usuário. */
export async function sendTestNotification(): Promise<{ delivered: boolean; error?: string }> {
  const session = await currentUser();
  if (!session) return { delivered: false, error: 'Entre na sua conta para continuar.' };
  const admin = createAdminClient();
  if (!admin) return { delivered: false, error: 'As notificações ainda não estão configuradas neste ambiente.' };

  const result = await notifyMessage(
    session.user.id,
    'teste',
    `teste:${randomUUID()}`,
    { title: 'Teste da trakfy', body: 'Se você está vendo isto, as notificações funcionam neste aparelho.', url: '/configuracoes' },
    supabaseNotifyDeps(admin),
  ).catch(() => null);
  if (!result) return { delivered: false, error: 'Não foi possível enviar agora.' };
  if (result.created === 0) return { delivered: false, error: 'Nenhum aparelho ativo. Ative as notificações neste aparelho primeiro.' };
  return result.delivered > 0 ? { delivered: true } : { delivered: false, error: 'O envio falhou. Desative e ative de novo neste aparelho.' };
}
