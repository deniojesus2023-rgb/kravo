'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { groupConversations } from '@/lib/alfred/history';
import type { Conversation } from '@/lib/alfred/types';
import { ConfirmDialog } from './states';

/**
 * Histórico agrupado por período. Renomear e excluir só aparecem quando quem usa o componente entrega as ações
 * (ou seja, quando o backend de conversas existir). Sem conversas, mostra o estado vazio.
 */
export function ConversationList({ conversations, activeId, now, onRename, onDelete }: { conversations: Conversation[]; activeId?: string | null; now: Date; onRename?: (id: string, title: string) => Promise<void>; onDelete?: (id: string) => Promise<void> }) {
  const groups = groupConversations(conversations, now);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [pending, setPending] = useState(false);

  if (groups.length === 0) {
    return <p className="m-0 px-2.5 text-[12.5px] leading-relaxed text-fg-subtle">Nenhuma conversa ainda. Comece uma nova para ela aparecer aqui.</p>;
  }

  async function saveRename(id: string) {
    const title = draft.trim();
    setEditing(null);
    if (title && onRename) await onRename(id, title);
  }

  return (
    <>
      <nav aria-label="Histórico de conversas" className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g.id} aria-label={g.label} className="flex flex-col gap-0.5">
            <h3 className="m-0 px-2.5 pb-1 text-[11px] font-medium tracking-[0.12em] text-fg-subtle uppercase">{g.label}</h3>
            {g.items.map((c) => (
              <div key={c.id} className={cn('group flex items-center gap-1 rounded-lg', c.id === activeId ? 'bg-nav-active' : 'hover:bg-nav-hover')}>
                {editing === c.id ? (
                  <form onSubmit={(e) => (e.preventDefault(), void saveRename(c.id))} className="flex min-w-0 flex-1 items-center gap-1 p-1">
                    <input autoFocus aria-label="Novo título da conversa" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} className="h-8 min-w-0 flex-1 rounded-md border border-line-strong bg-canvas px-2 text-[13px]" />
                    <button type="submit" aria-label="Salvar título" className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:text-fg"><Check size={15} /></button>
                    <button type="button" aria-label="Cancelar" onClick={() => setEditing(null)} className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:text-fg"><X size={15} /></button>
                  </form>
                ) : (
                  <>
                    <Link href={`/alfred/c/${c.id}`} aria-current={c.id === activeId ? 'page' : undefined} className="min-w-0 flex-1 truncate px-2.5 py-2 text-[13.5px] text-fg-muted group-hover:text-fg aria-[current=page]:text-fg">
                      {c.title}
                    </Link>
                    {onRename && (
                      <button type="button" aria-label={`Renomear: ${c.title}`} onClick={() => (setDraft(c.title), setEditing(c.id))} className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle opacity-100 hover:text-fg lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                        <Pencil size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" aria-label={`Excluir: ${c.title}`} onClick={() => setDeleting(c)} className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle opacity-100 hover:text-loss lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </section>
        ))}
      </nav>
      <ConfirmDialog
        open={deleting !== null}
        title="Excluir conversa?"
        description={`“${deleting?.title ?? ''}” será excluída e não poderá ser recuperada.`}
        confirmLabel="Excluir"
        pending={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting || !onDelete) return;
          setPending(true);
          try {
            await onDelete(deleting.id);
          } finally {
            setPending(false);
            setDeleting(null);
          }
        }}
      />
    </>
  );
}
