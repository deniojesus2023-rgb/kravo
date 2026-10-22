import { formatBRL, formatInt, formatPercent, formatRoas } from '@/lib/format';
import type { CreativeRow } from '@/lib/creatives/read';
import { CREATIVE_LABELS, type CreativeTag } from '@/lib/rules';

const TAG_CLASS: Record<CreativeTag, string> = {
  destaque: 'bg-positive/15 text-positive',
  revisar: 'bg-warn/15 text-warn',
  dados_insuficientes: 'border border-dashed border-line-strong text-fg-muted',
};

const dash = '—';

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11.5px] text-fg-subtle">{label}</span>
      <span className={`num text-[14px] ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

export function CreativesGrid({ rows, salesConnected }: { rows: CreativeRow[]; salesConnected: boolean }) {
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 p-0">
      {rows.map((c, i) => {
        const tone = c.roas === null ? '' : c.roas >= 2.5 ? 'text-positive' : c.roas < 1.5 ? 'text-negative' : '';
        return (
          <li key={c.id} className="card box-border flex min-w-0 flex-col gap-3 p-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="num text-[11px] text-fg-muted">#{i + 1}</span>
                <span className="text-[11.5px] text-fg-muted">{c.status === 'ativa' ? 'Ativo' : 'Pausado'}</span>
              </div>
              <span className="num truncate text-[12px] font-medium" title={c.name}>
                {c.name}
              </span>
              <div className="min-h-[22px]">
                {c.tag && <span className={`inline-flex h-[22px] items-center rounded-full px-2.5 text-[11.5px] font-medium ${TAG_CLASS[c.tag]}`}>{CREATIVE_LABELS[c.tag]}</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
              <Metric label="Gasto" value={formatBRL(c.spendCents, { decimals: 0 })} />
              <Metric label="ROAS real" value={c.roas === null ? dash : formatRoas(c.roas)} tone={tone} />
              <Metric label="CPA" value={c.cpaCents === null ? dash : formatBRL(c.cpaCents, { decimals: 2 })} />
              <Metric label="CTR" value={c.ctr === null ? dash : formatPercent(c.ctr)} />
              <Metric label="Hook rate" value={c.hook === null ? dash : formatPercent(c.hook, 0)} />
              <Metric label="Vendas" value={c.sales === null ? dash : formatInt(c.sales)} />
            </div>
          </li>
        );
      })}
      {!salesConnected && <li className="sr-only">ROAS, CPA e vendas ficam indisponíveis sem plataforma de vendas ligada à oferta.</li>}
    </ul>
  );
}
