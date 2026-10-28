'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { sectionTitle } from '@/lib/alfred/nav';
import { AlfredMark } from './AlfredMark';

/** Cabeçalho discreto: no celular traz o botão do menu; sempre diz se a IA está conectada. */
export function AppHeader({ onMenu, aiConnected }: { onMenu: () => void; aiConnected: boolean }) {
  const title = sectionTitle(usePathname());
  return (
    <header className="flex h-14 flex-none items-center justify-between gap-3 border-b border-line-faint px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button type="button" aria-haspopup="dialog" aria-label="Abrir menu" onClick={onMenu} className="inline-flex size-11 items-center justify-center rounded-lg text-fg-muted hover:bg-nav-hover hover:text-fg lg:hidden">
          <Menu size={20} aria-hidden="true" />
        </button>
        <AlfredMark size={26} className="lg:hidden" />
        <span className="truncate text-[14px] font-medium">{title}</span>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[12px] text-fg-muted">
        <span aria-hidden="true" className={aiConnected ? 'size-1.5 rounded-full bg-profit' : 'size-1.5 rounded-full bg-warn'} />
        {aiConnected ? 'IA conectada' : 'IA não conectada'}
      </span>
    </header>
  );
}
