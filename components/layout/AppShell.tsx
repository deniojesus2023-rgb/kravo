'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { SidebarContent, type SidebarData } from './SidebarContent';

/**
 * Estrutura comum a todas as telas. A partir de 1024px a sidebar fica fixa;
 * abaixo disso ela abre num <dialog> modal (foco preso, Esc fecha, foco volta
 * ao botão), sem JavaScript de foco próprio.
 */
export function AppShell({ sidebar, children }: { sidebar: SidebarData; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const fullHeight = pathname === '/alfred' || pathname.startsWith('/alfred/');

  const close = useCallback(() => dialogRef.current?.close(), []);

  // Navegar fecha o menu.
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Se a tela crescer com o menu aberto, ele deixa de ser modal.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => query.matches && close();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [close]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-[13.5px] focus:font-semibold focus:text-canvas"
      >
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-dvh w-[248px] flex-none overflow-y-auto border-r border-line-faint bg-canvas px-3 py-5 lg:flex lg:flex-col">
        <SidebarContent {...sidebar} />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line-faint bg-canvas px-4 lg:hidden">
        <Logo />
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-[13.5px] text-fg-muted hover:text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Menu
        </button>
      </header>

      <dialog
        ref={dialogRef}
        aria-label="Menu de navegação"
        onClick={(event) => event.target === event.currentTarget && close()}
        className="m-0 h-dvh max-h-none w-[min(300px,86vw)] max-w-none overflow-y-auto border-r border-line bg-canvas p-0 text-fg backdrop:bg-canvas/70 open:flex open:flex-col lg:hidden"
      >
        <div className="flex flex-1 flex-col px-3 py-5">
          <button
            type="button"
            onClick={close}
            className="mb-3 ml-auto inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] text-fg-muted hover:text-fg"
          >
            Fechar menu
          </button>
          <SidebarContent {...sidebar} />
        </div>
      </dialog>

      {/* O Alfred ocupa a altura toda (chat com campo fixo embaixo e rolagem própria); as demais telas rolam a página. */}
      <main id="conteudo" tabIndex={-1} className={cn('min-w-0 flex-1 outline-none', fullHeight ? 'h-[calc(100dvh-3.5rem)] overflow-hidden lg:h-dvh' : 'px-4 pt-6 pb-10 sm:px-6 lg:px-9 lg:pt-7')}>
        <div className={fullHeight ? 'flex h-full min-h-0 flex-col' : 'flex flex-col gap-6'}>{children}</div>
      </main>
    </div>
  );
}
