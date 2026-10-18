import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

/** Páginas públicas (sem login): a Meta e qualquer visitante precisam lê-las. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col gap-8 px-4 py-8 sm:px-6">
      <header>
        <Link href="/" aria-label="kavro, início">
          <Logo />
        </Link>
      </header>
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[13px] text-fg-muted">
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-fg">
          Política de privacidade
        </Link>
        <Link href="/termos" className="underline underline-offset-2 hover:text-fg">
          Termos de serviço
        </Link>
        <Link href="/exclusao-de-dados" className="underline underline-offset-2 hover:text-fg">
          Exclusão de dados
        </Link>
      </footer>
    </div>
  );
}
