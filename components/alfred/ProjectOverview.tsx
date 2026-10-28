import { formatBRL, formatDateShort } from '@/lib/format';
import type { Project } from '@/lib/alfred/types';
import { PROJECT_STATUS } from './ProjectCard';

/** Campos do projeto. Os não informados aparecem como "Não informado", nunca preenchidos por suposição. */
export function ProjectOverview({ project: p }: { project: Project }) {
  const rows: Array<[string, string]> = [
    ['Tipo de negócio', p.businessType],
    ['Mercado', p.market],
    ['Produto ou serviço', p.product],
    ['Público-alvo', p.audience],
    ['Oferta', p.offer],
    ['Preço', p.priceCents !== null ? formatBRL(p.priceCents, { decimals: 2 }) : ''],
    ['Objetivo', p.objective],
    ['Status', PROJECT_STATUS[p.status].label],
    ['Criado em', formatDateShort(p.createdAt)],
  ];
  return (
    <div className="flex flex-col gap-5">
      {p.description && <p className="m-0 max-w-[70ch] text-[14.5px] leading-[1.7] text-fg-muted">{p.description}</p>}
      <dl className="m-0 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
        {rows.map(([label, value], i) => (
          // Com número ímpar de campos, o último ocupa a linha toda (sem célula vazia).
          <div key={label} className={`flex flex-col gap-1 bg-surface p-4 ${rows.length % 2 === 1 && i === rows.length - 1 ? 'sm:col-span-2' : ''}`}>
            <dt className="text-[12px] text-fg-subtle">{label}</dt>
            <dd className={`m-0 text-[14.5px] ${value ? '' : 'text-fg-subtle'}`}>{value || 'Não informado'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
