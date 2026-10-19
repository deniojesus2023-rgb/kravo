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
  // Sem plataforma de vendas a receita é desconhecida: nada de ROAS real, reembolso ou ticket "zerados".
  const known = data.salesConnected;
  const roasReal = known ? roas(approvedRevenueCents, spendCents) : null;
  const rate = known ? refundRate(refundedCents, approvedRevenueCents) : null;

  return {
    offer: data.offer,
    salesConnected: known,
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
    cpaCents: known ? cpaCents(spendCents, sales) : null,
    ticketCents: known ? averageTicketCents(approvedRevenueCents, sales) : null,
    refundRate: rate,
    decision: decideOfferAction(
      { adSpendCents: spendCents, sales, netProfitCents: profit, roas: roasReal, refundRate: rate, salesConnected: known },
      data.offer.decisionParams,
    ),
    deltas: data.deltas,
  };
}
