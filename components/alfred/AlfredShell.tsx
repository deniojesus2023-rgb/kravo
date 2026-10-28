'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { AppHeader } from './AppHeader';
import { AppSidebar, type SidebarData } from './AppSidebar';

/**
 * Estrutura do Alfred. Desktop (≥1024px): sidebar fixa de 260px. Abaixo disso: drawer em <dialog> modal
 * (foco preso, Esc fecha, foco volta ao botão). A rolagem acontece dentro da área principal.
 */
export function AlfredShell({ sidebar, aiConnected, children }: { sidebar: SidebarData; aiConnected: boolean; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => query.matches && close();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [close]);

  return (
    <div className="alfred flex h-dvh overflow-hidden">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-[13.5px] focus:font-semibold focus:text-canvas">
        Pular para o conteúdo
      </a>

      <aside className="hidden w-[260px] flex-none border-r border-line-faint bg-surface-sunken lg:block">
        <AppSidebar {...sidebar} />
      </aside>

      <dialog ref={dialogRef} aria-label="Menu do Alfred" onClick={(e) => e.target === e.currentTarget && close()} className="m-0 h-dvh max-h-none w-[min(300px,86vw)] max-w-none overflow-hidden border-r border-line bg-surface-sunken p-0 text-fg backdrop:bg-canvas/70 open:flex open:flex-col lg:hidden">
        <button type="button" onClick={close} aria-label="Fechar menu" className="absolute top-3 right-3 z-10 inline-flex size-10 items-center justify-center rounded-lg text-fg-muted hover:bg-nav-hover hover:text-fg">
          <X size={18} aria-hidden="true" />
        </button>
        <AppSidebar {...sidebar} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onMenu={() => dialogRef.current?.showModal()} aiConnected={aiConnected} />
        <main id="conteudo" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
