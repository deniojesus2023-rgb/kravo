import {
  averageTicketCents,
  cpaCents,
  decideOfferAction,
  netProfitCents,
  refundRate,
  roas,
} from '@/lib/rules';
import type { OfferPeriodData, OfferSummary, PeriodRange } from './types';

const sum = <T>(items: T[], pick: (item: T) => number) => items.reduce((acc, item) => acc + pick(item), 0);

/** Soma os dados brutos de uma oferta e aplica as regras. Independe da fonte (exemplo ou real). */
export function summarizeOffer(data: OfferPeriodData, period: PeriodRange): OfferSummary {
  const spendCents = sum(data.daily, (d) => d.spendCents);
  const approvedRevenueCents = sum(data.sales, (s) => s.approvedRevenueCents);
  const refundedCents = sum(data.sales, (s) => s.refundedCents);
  const sales = sum(data.sales, (s) => s.approvedOrders);
  const metaPurchases = sum(data.daily, (d) => d.metaPurchases);
  const metaPurchaseValueCents = sum(data.daily, (d) => d.metaPurchaseValueCents);

  const profit = netProfitCents({ approvedRevenueCents, refundedCents, adSpendCents: spendCents });
  const roasReal = roas(approvedRevenueCents, spendCents);
  const rate = refundRate(refundedCents, approvedRevenueCents);

  return {
    offer: data.offer,
    period,
    spendCents,
    approvedRevenueCents,
    refundedCents,
    sales,
    netProfitCents: profit,
    roasReal,
    roasMeta: roas(metaPurchaseValueCents, spendCents),
    metaPurchases,
    metaPurchaseValueCents,
    cpaCents: cpaCents(spendCents, sales),
    ticketCents: averageTicketCents(approvedRevenueCents, sales),
    refundRate: rate,
    decision: decideOfferAction(
      { adSpendCents: spendCents, sales, netProfitCents: profit, roas: roasReal, refundRate: rate },
      data.offer.decisionParams,
    ),
    deltas: data.deltas,
  };
}
