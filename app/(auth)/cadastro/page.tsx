import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth/AuthForm';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/messages';
import { isAuthConfigured } from '@/lib/supabase/env';
import { signUp } from '../actions';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignUpPage() {
  if (!isAuthConfigured()) {
    return (
      <section className="card flex flex-col gap-3 p-5" aria-labelledby="sem-auth">
        <h1 id="sem-auth" className="m-0 text-base font-semibold">
          Autenticação não configurada
        </h1>
        <p className="m-0 text-[13.5px] leading-relaxed text-fg-muted">O cadastro será ativado junto com o login.</p>
        <Link href="/" className="inline-flex h-9 w-fit items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
          Ver dados de exemplo
        </Link>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="criar">
      <h1 id="criar" className="m-0 text-[26px] font-semibold tracking-[-0.02em]">
        Criar conta
      </h1>
      <AuthForm
        action={signUp}
        submitLabel="Criar conta"
        fields={[
          { name: 'name', label: 'Nome (opcional)', type: 'text', autoComplete: 'name' },
          { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', required: true },
          {
            name: 'password',
            label: 'Senha',
            type: 'password',
            autoComplete: 'new-password',
            required: true,
            hint: `Ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
          },
        ]}
      />
      <p className="m-0 text-[13px] text-fg-muted">
        Já tem conta?{' '}
        <Link href="/login" className="text-fg underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </section>
  );
}
