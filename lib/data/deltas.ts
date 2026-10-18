import { averageTicketCents, cpaCents, netProfitCents, roas } from '@/lib/rules';
import type { PeriodDeltas } from './types';

export interface PeriodTotals {
  spendCents: number;
  approvedRevenueCents: number;
  refundedCents: number;
  sales: number;
}

/** Variação relativa. `null` quando falta base (anterior ausente ou zero) ou o valor atual não existe. */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Variações do período contra o anterior, calculadas só com dados que existem. */
export function computeDeltas(current: PeriodTotals, previous: PeriodTotals): PeriodDeltas {
  const profit = (t: PeriodTotals) =>
    netProfitCents({ approvedRevenueCents: t.approvedRevenueCents, refundedCents: t.refundedCents, adSpendCents: t.spendCents });
  // Sem nenhum movimento no período anterior não há com o que comparar.
  const hasBase = previous.spendCents > 0 || previous.approvedRevenueCents > 0 || previous.sales > 0;
  if (!hasBase) {
    return { spend: null, revenue: null, profit: null, roas: null, cpa: null, ticket: null };
  }
  return {
    spend: relativeChange(current.spendCents, previous.spendCents),
    revenue: relativeChange(current.approvedRevenueCents, previous.approvedRevenueCents),
    profit: relativeChange(profit(current), profit(previous)),
    roas: relativeChange(roas(current.approvedRevenueCents, current.spendCents), roas(previous.approvedRevenueCents, previous.spendCents)),
    cpa: relativeChange(cpaCents(current.spendCents, current.sales), cpaCents(previous.spendCents, previous.sales)),
    ticket: relativeChange(
      averageTicketCents(current.approvedRevenueCents, current.sales),
      averageTicketCents(previous.approvedRevenueCents, previous.sales),
    ),
  };
}
