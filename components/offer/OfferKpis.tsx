import { Delta } from '@/components/ui/Delta';
import { formatBRL, formatPercent, formatRoas } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { OfferSummary } from '@/lib/data';
import type { ReactNode } from 'react';

function Kpi({ label, value, valueClass, children }: { label: string; value: string; valueClass?: string; children: ReactNode }) {
  return (
    <div className="card flex min-w-0 flex-col gap-2 px-[18px] py-4">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span className={cn('num text-[22px] font-medium tracking-[-0.02em] xl:text-2xl', valueClass)}>{value}</span>
      <span className="text-[12.5px] text-fg-muted">{children}</span>
    </div>
  );
}

export function OfferKpis({ summary }: { summary: OfferSummary }) {
  const { deltas } = summary;
  const brl2 = (cents: number | null) => (cents === null ? '—' : formatBRL(cents, { decimals: 2 }));
  const known = summary.salesConnected;
  const unknownNote = 'Sem plataforma de vendas';
  const metaGap =
    summary.roasReal !== null && summary.roasMeta !== null && summary.roasReal > 0
      ? summary.roasMeta / summary.roasReal - 1
      : null;

  return (
    <section aria-label="Indicadores da oferta" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-4">
      <Kpi label="Gasto" value={formatBRL(summary.spendCents)}>
        <Delta value={deltas.spend} polarity="neutral" />
      </Kpi>
      <Kpi label="Receita" value={known ? formatBRL(summary.approvedRevenueCents) : '—'}>
        {known ? <Delta value={deltas.revenue} polarity="higher-is-better" /> : unknownNote}
      </Kpi>
      <Kpi
        label="Lucro líquido"
        value={known ? formatBRL(summary.netProfitCents) : '—'}
        valueClass={known && summary.netProfitCents < 0 ? 'text-loss' : 'text-fg'}
      >
        {known ? <Delta value={deltas.profit} polarity="higher-is-better" /> : unknownNote}
      </Kpi>
      <Kpi label="Reembolsos" value={known ? formatBRL(summary.refundedCents) : '—'}>
        {known ? (
          <>
            <span className="num">{summary.refundRate === null ? '—' : formatPercent(summary.refundRate)}</span> da receita
          </>
        ) : (
          unknownNote
        )}
      </Kpi>
      <Kpi label="ROAS real" value={formatRoas(summary.roasReal)}>
        {known ? <Delta value={deltas.roas} polarity="higher-is-better" /> : unknownNote}
      </Kpi>
      <Kpi label="ROAS Meta" value={formatRoas(summary.roasMeta)}>
        {metaGap === null ? (
          known ? 'Sem dados' : 'Reportado pelo Meta · sem ROAS real para comparar'
        ) : (
          <>
            Reportado pelo Meta · <span className="num">{metaGap >= 0 ? '+' : '−'}{formatPercent(Math.abs(metaGap))}</span> vs. real
          </>
        )}
      </Kpi>
      <Kpi label="CPA" value={brl2(summary.cpaCents)}>
        {known ? <Delta value={deltas.cpa} polarity="lower-is-better" /> : unknownNote}
      </Kpi>
      <Kpi label="Ticket médio" value={brl2(summary.ticketCents)}>
        {!known ? (
          unknownNote
        ) : deltas.ticket !== null && Math.abs(deltas.ticket) < 0.005 ? (
          'estável'
        ) : (
          <Delta value={deltas.ticket} polarity="neutral" />
        )}
      </Kpi>
    </section>
  );
}
