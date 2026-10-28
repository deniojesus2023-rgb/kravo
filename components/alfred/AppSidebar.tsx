'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, FolderKanban, Library, MessageSquare, Plus, Settings, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isActive, NAV_ITEMS, type NavItem } from '@/lib/alfred/nav';
import type { Conversation } from '@/lib/alfred/types';
import { AlfredBrand } from './AlfredMark';
import { ConversationList } from './ConversationList';

const ICONS: Record<NavItem['icon'], LucideIcon> = { chat: MessageSquare, library: Library, knowledge: BookOpen, projects: FolderKanban, settings: Settings };

export interface SidebarData {
  email: string | null;
  conversations: Conversation[];
  /** Instante de referência para os grupos do histórico (vem do servidor, para não divergir na hidratação). */
  nowIso: string;
  /** Server actions de renomear e excluir. Ausentes = os botões não aparecem. */
  onRename?: (id: string, title: string) => Promise<{ ok: boolean }>;
  onDelete?: (id: string) => Promise<{ ok: boolean }>;
}

export function AppSidebar({ email, conversations, nowIso, onRename, onDelete }: SidebarData) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname.startsWith('/alfred/c/') ? pathname.split('/')[3] : null;
  const name = email ? email.split('@')[0]! : 'Visitante';

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 px-3 py-5">
      <Link href="/alfred" className="rounded-lg px-1.5">
        <AlfredBrand />
      </Link>

      <Link href="/alfred" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-semibold text-canvas hover:bg-brand-hover">
        <Plus size={17} aria-hidden="true" />
        Nova conversa
      </Link>

      <nav aria-label="Alfred" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item, pathname);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('flex h-10 items-center gap-3 rounded-lg px-2.5 text-[14px] text-fg-muted hover:bg-nav-hover hover:text-fg', active && 'bg-nav-active text-fg')}>
              <Icon size={17} aria-hidden="true" className={active ? 'text-brand' : undefined} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line-faint" />

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

      <div className="flex items-center gap-3 border-t border-line-faint pt-4">
        <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-raised text-[13px] font-semibold text-brand uppercase">
          {name.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-medium">{name}</span>
          <span className="truncate text-[11.5px] text-fg-subtle">{email ?? 'Sem sessão'}</span>
        </span>
        <Link href="/alfred/configuracoes" aria-label="Configurações" className="inline-flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-nav-hover hover:text-fg">
          <Settings size={17} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
