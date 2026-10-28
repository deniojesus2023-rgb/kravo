import Link from 'next/link';
import { formatBRL, formatDateShort } from '@/lib/format';
import type { Project } from '@/lib/alfred/types';

export const PROJECT_STATUS: Record<Project['status'], { label: string; dot: string }> = {
  ativo: { label: 'Ativo', dot: 'bg-profit' },
  pausado: { label: 'Pausado', dot: 'bg-warn' },
  encerrado: { label: 'Encerrado', dot: 'bg-state-dashed' },
};

export function ProjectCard({ project: p }: { project: Project }) {
  const status = PROJECT_STATUS[p.status];
  return (
    <li className="flex">
      <Link href={`/alfred/projetos/${p.id}`} className="flex w-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 hover:border-line-strong hover:bg-surface-hover">
        <span className="inline-flex items-center gap-2 text-[12px] text-fg-muted"><span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />{status.label}</span>
        <span className="text-[15.5px] font-medium">{p.name}</span>
        {p.description && <span className="line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{p.description}</span>}
        <span className="mt-auto flex items-center justify-between gap-3 text-[12px] text-fg-subtle">
          <span className="min-w-0 truncate">{[p.businessType, p.market].filter(Boolean).join(' · ')}</span>
          <span className="num flex-none">{p.priceCents !== null ? formatBRL(p.priceCents, { decimals: 0 }) : formatDateShort(p.createdAt)}</span>
        </span>
      </Link>
    </li>
  );
}
