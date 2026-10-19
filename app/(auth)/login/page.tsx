import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth/AuthForm';
import { safeNext } from '@/lib/auth/redirect';
import { isAuthConfigured } from '@/lib/supabase/env';
import { cn } from '@/lib/cn';
import { sendMagicLink, signInWithPassword } from '../actions';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; modo?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const link = params.modo === 'link';
  const qs = (modo?: string) => {
    const q = new URLSearchParams();
    if (modo) q.set('modo', modo);
    if (next !== '/') q.set('next', next);
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  if (!isAuthConfigured()) {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="sem-auth">
        <h1 id="sem-auth" className="m-0 text-base font-semibold">
          Autenticação não configurada
        </h1>
        <p className="m-0 text-[13.5px] leading-relaxed text-fg-muted">
          Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para ativar o login. Enquanto isso, o app
          mostra apenas dados de exemplo.
        </p>
        <Link href="/" className="inline-flex h-9 w-fit items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
          Ver dados de exemplo
        </Link>
      </section>
    );
  }

  const tab = (active: boolean) =>
    cn('-mb-px border-b-2 px-3 py-2 text-[13.5px]', active ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg');

  return (
    <section className="flex flex-col gap-5" aria-labelledby="entrar">
      <h1 id="entrar" className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
        Entrar
      </h1>

      {params.erro === 'link' && (
        <p role="alert" className="m-0 rounded-lg border border-loss/40 px-3 py-2 text-[13px] text-loss">
          O link é inválido ou expirou. Peça um novo.
        </p>
      )}

      <nav aria-label="Forma de entrar" className="flex gap-1 border-b border-line">
        <Link href={`/login${qs()}`} aria-current={link ? undefined : 'page'} className={tab(!link)}>
          E-mail e senha
        </Link>
        <Link href={`/login${qs('link')}`} aria-current={link ? 'page' : undefined} className={tab(link)}>
          Link de acesso
        </Link>
      </nav>

      {link ? (
        <AuthForm
          action={sendMagicLink}
          next={next}
          submitLabel="Enviar link de acesso"
          fields={[{ name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', required: true }]}
        />
      ) : (
        <AuthForm
          action={signInWithPassword}
          next={next}
          submitLabel="Entrar"
          fields={[
            { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email', required: true },
            { name: 'password', label: 'Senha', type: 'password', autoComplete: 'current-password', required: true },
          ]}
        />
      )}

      <p className="m-0 text-[13px] text-fg-muted">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="text-fg underline underline-offset-2">
          Criar conta
        </Link>
      </p>
    </section>
  );
}
