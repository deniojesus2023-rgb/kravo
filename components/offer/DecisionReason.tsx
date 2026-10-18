import { ACTION_LABELS, type ActionDecision, type Criterion } from '@/lib/rules';
import { formatBRL, formatInt, formatPercent, formatRoas, formatPeriodShort } from '@/lib/format';
import { cn } from '@/lib/cn';

const decimalComma = (n: number) => String(n).replace('.', ',');

function formatValue(c: Criterion, v: number | null): string {
  if (v === null) return '—';
  switch (c.unit) {
    case 'x':
      return formatRoas(v);
    case 'percent':
      return formatPercent(v);
    case 'money':
      return formatBRL(v);
    case 'count':
      return formatInt(v);
  }
}

function formatThreshold(c: Criterion): string {
  switch (c.unit) {
    case 'x':
      return `${decimalComma(c.threshold)}x`;
    case 'percent':
      return formatPercent(c.threshold, Number.isInteger(c.threshold * 100) ? 0 : 1);
    case 'money':
      return formatBRL(c.threshold);
    case 'count':
      return formatInt(c.threshold);
  }
}

function requirement(c: Criterion): string {
  if (c.comparator === '>=') return `Mínimo ${formatThreshold(c)}`;
  if (c.comparator === '<=') return `Máximo ${formatThreshold(c)}`;
  return c.id === 'netProfit' ? 'Precisa ser negativo' : `Abaixo de ${formatThreshold(c)}`;
}

/** "Por que Escalar": critérios, valores e se cada um foi atendido, com janela e fonte. */
export function DecisionReason({
  decision,
  period,
  source,
}: {
  decision: ActionDecision;
  period: { start: string; end: string };
  source: string;
}) {
  const title = `Por que ${ACTION_LABELS[decision.action]}`;
  return (
    <section className="card flex flex-col gap-3.5 px-5 py-4" aria-labelledby="por-que">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <h2 id="por-que" className="m-0 text-[15px] font-semibold">
          {title}
        </h2>
        <span className="text-xs text-fg-subtle">
          Janela: {formatPeriodShort(period.start, period.end)} · Fonte: {source}
        </span>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 p-0">
        {decision.criteria.map((c) => (
          <li key={`${c.id}-${c.comparator}`} className="flex flex-col gap-1">
            <span className="text-[12.5px] text-fg-muted">{c.label}</span>
            <span className="num text-base font-medium">{formatValue(c, c.value)}</span>
            <span className="text-xs text-fg-subtle">
              {requirement(c)} · <span className={cn(c.met ? 'text-profit' : 'text-warn')}>{c.met ? 'Atende' : 'Não atende'}</span>
            </span>
          </li>
        ))}
      </ul>
      {decision.note && <p className="m-0 text-xs leading-relaxed text-fg-subtle">{decision.note}</p>}
    </section>
  );
}
