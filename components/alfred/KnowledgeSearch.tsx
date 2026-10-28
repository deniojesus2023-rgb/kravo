'use client';

import { useId, useMemo, useState } from 'react';
import { Search, SearchX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KNOWLEDGE_CATEGORIES, type Concept, type KnowledgeCategory } from '@/lib/alfred/types';
import { KnowledgeCard } from './KnowledgeCard';
import { EmptyState } from './states';

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Busca (sem acento e sem maiúsculas) e filtro por categoria sobre os conceitos recebidos. */
export function KnowledgeSearch({ concepts }: { concepts: Concept[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory | null>(null);
  const resultsId = useId();

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return concepts.filter((c) => (!category || c.category === category) && (!q || fold(`${c.name} ${c.summary} ${c.category} ${c.sourceDocument}`).includes(q)));
  }, [concepts, query, category]);

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search size={17} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-subtle" />
        <label htmlFor="busca-conhecimento" className="sr-only">Pesquisar conceitos</label>
        <input id="busca-conhecimento" type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-controls={resultsId} placeholder="Pesquisar conceitos, técnicas, frameworks…" className="h-12 w-full rounded-xl border border-line-strong bg-surface pr-4 pl-10 text-[15px] placeholder:text-fg-subtle focus:border-brand focus:outline-none" />
      </div>
      <div role="group" aria-label="Categorias" className="flex flex-wrap gap-2">
        {[null, ...KNOWLEDGE_CATEGORIES].map((c) => (
          <button key={c ?? 'todas'} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cn('h-9 rounded-full border px-3.5 text-[13px]', category === c ? 'border-brand bg-surface-raised text-fg' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg')}>
            {c ?? 'Todas'}
          </button>
        ))}
      </div>
      <p role="status" className="m-0 text-[12.5px] text-fg-subtle">{shown.length} {shown.length === 1 ? 'conceito' : 'conceitos'}</p>
      {shown.length === 0 ? (
        <EmptyState icon={<SearchX size={26} aria-hidden="true" />} title="Nada encontrado" description="Nenhum conceito corresponde à busca e à categoria escolhidas." />
      ) : (
        <ul id={resultsId} aria-label="Conceitos" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => <KnowledgeCard key={c.id} concept={c} />)}
        </ul>
      )}
    </div>
  );
}
