import Link from 'next/link';
import type { Concept } from '@/lib/alfred/types';

export function KnowledgeCard({ concept }: { concept: Concept }) {
  return (
    <li className="flex">
      <Link href={`/alfred/conhecimento/${concept.id}`} className="flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 hover:border-line-strong hover:bg-surface-hover">
        <span className="w-fit rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-fg-muted">{concept.category}</span>
        <span className="text-[15px] font-medium">{concept.name}</span>
        <span className="line-clamp-3 text-[13px] leading-relaxed text-fg-muted">{concept.summary}</span>
        <span className="mt-auto flex items-center justify-between gap-3 text-[12px] text-fg-subtle">
          <span className="min-w-0 truncate" title={concept.sourceDocument}>{concept.sourceDocument}</span>
          <span className="num flex-none">{concept.sourceCount} {concept.sourceCount === 1 ? 'fonte' : 'fontes'}</span>
        </span>
      </Link>
    </li>
  );
}
