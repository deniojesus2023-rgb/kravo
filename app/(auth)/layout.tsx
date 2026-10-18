import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Logo large />
        <p className="m-0 text-[13px] text-fg-muted">Cada oferta. Uma decisão.</p>
      </div>
      {children}
      <p className="m-0 flex gap-4 text-xs text-fg-subtle">
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-fg-muted">
          Privacidade
        </Link>
        <Link href="/termos" className="underline underline-offset-2 hover:text-fg-muted">
          Termos
        </Link>
      </p>
    </main>
  );
}
