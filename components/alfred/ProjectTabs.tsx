'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Project } from '@/lib/alfred/types';
import { ProjectOverview } from './ProjectOverview';
import { EmptyState } from './states';

const TABS = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'analises', label: 'Análises' },
  { id: 'conversas', label: 'Conversas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'memoria', label: 'Memória' },
] as const;

const EMPTY: Record<Exclude<(typeof TABS)[number]['id'], 'visao'>, { title: string; description: string }> = {
  analises: { title: 'Nenhuma análise neste projeto', description: 'As análises feitas pelo Alfred para este projeto aparecem aqui, com data e fonte.' },
  conversas: { title: 'Nenhuma conversa associada', description: 'Conversas ligadas a este projeto aparecem aqui.' },
  documentos: { title: 'Nenhum documento associado', description: 'Documentos da Biblioteca usados neste projeto aparecem aqui.' },
  memoria: { title: 'Memória vazia', description: 'O que o Alfred guardar sobre este projeto fica aqui, para você conferir e corrigir.' },
};

/** Abas com semântica de tablist: setas, Home e End navegam. */
export function ProjectTabs({ project, extra }: { project: Project; extra?: Partial<Record<keyof typeof EMPTY, ReactNode>> }) {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('visao');
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setActive(TABS[next]!.id);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Seções do projeto" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t, i) => (
          <button key={t.id} ref={(el) => void (refs.current[i] = el)} role="tab" id={`${base}-${t.id}`} aria-selected={active === t.id} aria-controls={`${base}-p-${t.id}`} tabIndex={active === t.id ? 0 : -1} onClick={() => setActive(t.id)} onKeyDown={(e) => onKey(e, i)} className={cn('-mb-px h-11 flex-none border-b-2 px-4 text-[14px]', active === t.id ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg')}>
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-p-${t.id}`} aria-labelledby={`${base}-${t.id}`} hidden={active !== t.id}>
          {active === t.id && (t.id === 'visao' ? <ProjectOverview project={project} /> : (extra?.[t.id] ?? <EmptyState title={EMPTY[t.id].title} description={EMPTY[t.id].description} />))}
        </div>
      ))}
    </div>
  );
}
