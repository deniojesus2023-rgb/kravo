'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MessagesSquare, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isActive, NAV_ITEMS } from '@/lib/alfred/nav';
import type { Conversation } from '@/lib/alfred/types';
import { ConversationList } from './ConversationList';

export interface AlfredChromeProps {
  conversations: Conversation[];
  /** Instante de referência para os grupos do histórico (vem do servidor, para não divergir na hidratação). */
  nowIso: string;
  aiConnected: boolean;
  /** Server actions de renomear e excluir. Ausentes = os botões não aparecem. */
  onRename?: (id: string, title: string) => Promise<{ ok: boolean }>;
  onDelete?: (id: string) => Promise<{ ok: boolean }>;
  children: ReactNode;
}

const newChat = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover';

/**
 * Moldura do Alfred dentro da trakfy: título, estado da IA e abas das seções (como as abas de uma oferta).
 * No chat, o histórico fica numa coluna à esquerda (a partir de 1024px) ou numa janela ("Conversas") no celular.
 */
export function AlfredChrome({ conversations, nowIso, aiConnected, onRename, onDelete, children }: AlfredChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isChat = pathname === '/alfred' || pathname.startsWith('/alfred/c/');
  const activeId = pathname.startsWith('/alfred/c/') ? pathname.split('/')[3] : null;
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

  const history = (
    <>
      <Link href="/alfred" className={newChat}>
        <Plus size={16} aria-hidden="true" />
        Nova conversa
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          now={new Date(nowIso)}
          onRename={onRename ? async (id, title) => void (await onRename(id, title)) : undefined}
          onDelete={
            onDelete
              ? async (id) => {
                  const r = await onDelete(id);
                  // Apagou a conversa aberta: volta para uma conversa nova.
                  if (r.ok && id === activeId) router.push('/alfred');
                }
              : undefined
          }
        />
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none flex-col gap-3 px-4 pt-5 sm:px-6 lg:px-9 lg:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="text-[17px] font-semibold tracking-[-0.01em]">Alfred</span>
            <span className="hidden text-[12px] text-fg-subtle sm:inline">Strategic Intelligence</span>
          </div>
          <div className="flex items-center gap-2">
            {isChat && (
              <button type="button" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-fg-muted hover:text-fg lg:hidden">
                <MessagesSquare size={14} aria-hidden="true" />
                Conversas
              </button>
            )}
            <span className="inline-flex items-center gap-2 text-[12.5px] text-fg-muted">
              <span aria-hidden="true" className={cn('size-1.5 rounded-full', aiConnected ? 'bg-profit' : 'bg-warn')} />
              {aiConnected ? 'IA conectada' : 'IA não conectada'}
            </span>
          </div>
        </div>
        <nav aria-label="Seções do Alfred" className="flex gap-1 overflow-x-auto border-b border-line">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] whitespace-nowrap', active ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {isChat ? (
        <div className="flex min-h-0 flex-1">
          <aside aria-label="Histórico de conversas" className="hidden w-[248px] flex-none flex-col gap-4 border-r border-line-faint px-3 py-4 lg:flex">{history}</aside>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      )}

      <dialog ref={dialogRef} aria-label="Conversas" onClick={(e) => e.target === e.currentTarget && close()} className="m-0 h-dvh max-h-none w-[min(320px,88vw)] max-w-none overflow-hidden border-r border-line bg-canvas p-0 text-fg backdrop:bg-canvas/70 open:flex open:flex-col lg:hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-[14px] font-medium">Conversas</span>
          <button type="button" onClick={close} aria-label="Fechar" className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:text-fg">
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4">{history}</div>
      </dialog>
    </div>
  );
}
