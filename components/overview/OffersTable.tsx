'use client';

import Link from 'next/link';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { ActionBadge } from '@/components/ui/ActionBadge';
import { formatBRL, formatInt, formatPercent, formatRoas } from '@/lib/format';
import {
  ACTION_LABELS,
  cpaCents,
  netProfitCents,
  refundRate,
  roas,
  type OfferAction,
} from '@/lib/rules';
import { cn } from '@/lib/cn';
import type { OfferSummary } from '@/lib/data';

const FILTERS: Array<{ id: 'todas' | OfferAction; label: string }> = [
  { id: 'todas', label: 'Todas' },
  { id: 'escalar', label: ACTION_LABELS.escalar },
  { id: 'manter', label: ACTION_LABELS.manter },
  { id: 'pausar', label: ACTION_LABELS.pausar },
  { id: 'dados_insuficientes', label: ACTION_LABELS.dados_insuficientes },
];

const roasTone = (value: number | null) => (value === null ? '' : value >= 2 ? 'text-profit' : value < 1 ? 'text-loss' : '');
const profitTone = (cents: number) => (cents < 0 ? 'text-loss' : 'text-profit');

const thBase = 'h-10 px-4 text-xs font-normal whitespace-nowrap text-fg-subtle first:pl-5 last:pr-5';
const thR = `${thBase} text-right`;
const thL = `${thBase} text-left`;
const td = 'num px-4 text-right text-[13.5px] whitespace-nowrap first:pl-5 last:pr-5';

export function OffersTable({ offers, footer }: { offers: OfferSummary[]; footer: ReactNode }) {
  const [filter, setFilter] = useState<'todas' | OfferAction>('todas');
  const regionId = useId();

  const visible = useMemo(
    () => (filter === 'todas' ? offers : offers.filter((o) => o.decision.action === filter)),
    [offers, filter],
  );

  const totals = useMemo(() => {
    const sum = (pick: (o: OfferSummary) => number) => visible.reduce((acc, o) => acc + pick(o), 0);
    const spend = sum((o) => o.spendCents);
    // Lucro, ROAS e vendas só somam ofertas com plataforma de vendas conectada; as demais têm receita desconhecida.
    const known = visible.filter((o) => o.salesConnected);
    const sumKnown = (pick: (o: OfferSummary) => number) => known.reduce((acc, o) => acc + pick(o), 0);
    const spendKnown = sumKnown((o) => o.spendCents);
    const revenue = sumKnown((o) => o.approvedRevenueCents);
    const refunded = sumKnown((o) => o.refundedCents);
    const sales = sumKnown((o) => o.sales);
    const any = known.length > 0;
    return {
      spend,
      any,
      sales,
      cpa: any ? cpaCents(spendKnown, sales) : null,
      roas: any ? roas(revenue, spendKnown) : null,
      profit: netProfitCents({ approvedRevenueCents: revenue, refundedCents: refunded, adSpendCents: spendKnown }),
      refundRate: any ? refundRate(refunded, revenue) : null,
    };
  }, [visible]);

  const countOf = (id: 'todas' | OfferAction) =>
    id === 'todas' ? offers.length : offers.filter((o) => o.decision.action === id).length;

  return (
    <section className="card overflow-hidden" aria-labelledby="tabela-ofertas">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-[18px] pb-4">
        <div className="flex flex-col gap-1">
          <h2 id="tabela-ofertas" className="m-0 text-base font-semibold">
            Ofertas lado a lado
          </h2>
          <span className="text-[12.5px] text-fg-muted">Ordenadas por lucro. Clique em uma oferta para ver o detalhe.</span>
        </div>
        <div role="group" aria-label="Filtrar por ação" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'h-7 rounded-full border px-3 text-[12.5px]',
                  on
                    ? 'border-line-strong bg-surface-raised text-fg'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {f.label} · {countOf(f.id)}
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Mostrando {visible.length} de {offers.length} ofertas.
      </p>

      <div
        id={regionId}
        role="region"
        aria-label="Tabela de ofertas, role para os lados em telas estreitas"
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[1000px] border-collapse">
          <caption className="sr-only">
            Ofertas do período com gasto, vendas, CPA, ROAS real, lucro, reembolso e ação indicada.
          </caption>
          <thead>
            <tr className="border-t border-line">
              <th scope="col" className={cn(thL, 'w-[26%]')}>
                Oferta
              </th>
              <th scope="col" className={thR}>Gasto</th>
              <th scope="col" className={thR}>Vendas</th>
              <th scope="col" className={thR}>CPA</th>
              <th scope="col" className={thR}>ROAS real</th>
              <th scope="col" className={thR}>Lucro</th>
              <th scope="col" className={thR}>Reembolso</th>
              <th scope="col" className={thL}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <tr key={o.offer.id} className="relative h-[60px] border-t border-line-faint hover:bg-surface-hover">
                <th scope="row" className="px-5 py-2 text-left font-normal">
                  <Link href={`/ofertas/${o.offer.id}`} className="row-link flex flex-col gap-[3px]">
                    <span className="text-sm font-medium">{o.offer.name}</span>
                    <span className="text-xs text-fg-subtle">
                      {o.offer.salesPlatform} · {formatBRL(o.offer.priceCents, { decimals: 2 })}
                    </span>
                  </Link>
                </th>
                <td className={td}>{formatBRL(o.spendCents)}</td>
                {o.salesConnected ? (
                  <>
                    <td className={td}>{formatInt(o.sales)}</td>
                    <td className={td}>{o.cpaCents === null ? '—' : formatBRL(o.cpaCents, { decimals: 2 })}</td>
                    <td className={cn(td, roasTone(o.roasReal))}>{formatRoas(o.roasReal)}</td>
                    <td className={cn(td, profitTone(o.netProfitCents))}>{formatBRL(o.netProfitCents, { sign: true })}</td>
                    <td className={cn(td, 'text-fg-muted')}>{o.refundRate === null ? '—' : formatPercent(o.refundRate)}</td>
                  </>
                ) : (
                  <td colSpan={5} className="px-4 text-left text-xs whitespace-nowrap text-fg-subtle">
                    — Sem plataforma de vendas conectada: vendas, CPA, ROAS real, lucro e reembolso indisponíveis
                  </td>
                )}
                <td className="px-4 text-left last:pr-5">
                  <ActionBadge action={o.decision.action} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-[52px] border-t border-line bg-surface-sunken text-[13.5px] font-medium">
              <th scope="row" className="px-5 text-left font-medium">
                {filter === 'todas' ? 'Total' : `Total · ${ACTION_LABELS[filter]}`}
              </th>
              <td className={td}>{formatBRL(totals.spend)}</td>
              <td className={td}>{totals.any ? formatInt(totals.sales) : '—'}</td>
              <td className={td}>{totals.cpa === null ? '—' : formatBRL(totals.cpa, { decimals: 2 })}</td>
              <td className={td}>{formatRoas(totals.roas)}</td>
              <td className={cn(td, totals.any && profitTone(totals.profit))}>{totals.any ? formatBRL(totals.profit, { sign: true }) : '—'}</td>
              <td className={cn(td, 'text-fg-muted')}>{totals.refundRate === null ? '—' : formatPercent(totals.refundRate)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {footer}
    </section>
  );
}
