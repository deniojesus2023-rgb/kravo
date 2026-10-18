'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authErrorMessage, validateEmail, validatePassword } from '@/lib/auth/messages';
import { safeNext } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';

export type AuthFormState = { error?: string; message?: string } | undefined;

const NOT_CONFIGURED = 'A autenticação ainda não está configurada neste ambiente.';

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function callbackUrl(next: string): Promise<string> {
  return `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithPassword(_: AuthFormState, data: FormData): Promise<AuthFormState> {
  const email = text(data, 'email').toLowerCase();
  const password = String(data.get('password') ?? '');
  const next = safeNext(text(data, 'next'));

  const invalid = validateEmail(email) ?? (password ? null : 'Informe a senha.');
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: authErrorMessage(error) };
  redirect(next);
}

export async function signUp(_: AuthFormState, data: FormData): Promise<AuthFormState> {
  const name = text(data, 'name').slice(0, 80);
  const email = text(data, 'email').toLowerCase();
  const password = String(data.get('password') ?? '');

  const invalid = validateEmail(email) ?? validatePassword(password);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED };

  const { data: result, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: name ? { name } : {}, emailRedirectTo: await callbackUrl('/') },
  });
  if (error) return { error: authErrorMessage(error) };

  // Com confirmação de e-mail ligada não há sessão ainda; sem ela, o usuário já entra.
  if (result.session) redirect('/');
  return { message: 'Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar a conta.' };
}

export async function sendMagicLink(_: AuthFormState, data: FormData): Promise<AuthFormState> {
  const email = text(data, 'email').toLowerCase();
  const next = safeNext(text(data, 'next'));

  const invalid = validateEmail(email);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: await callbackUrl(next) },
  });
  // Resposta igual exista ou não a conta, para não revelar quem está cadastrado.
  if (error && (error.code === 'over_email_send_rate_limit' || error.status === 429)) {
    return { error: authErrorMessage(error) };
  }
  return { message: 'Se este e-mail tiver uma conta, enviamos um link de acesso. Ele expira em pouco tempo.' };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect('/login');
}
