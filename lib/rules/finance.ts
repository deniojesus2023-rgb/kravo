/**
 * Cálculos financeiros por oferta. Funções puras; valores em centavos de BRL.
 * Quando o denominador é zero o resultado é `null`: nunca inventamos um valor.
 */

export const NET_PROFIT_FORMULA = 'Lucro líquido = receita − reembolsos − gasto em mídia.';
export const FEES_NOT_REGISTERED_NOTICE = 'Taxas e custos de produto ainda não cadastrados.';

export interface NetProfitInput {
  /** Receita de pedidos aprovados na plataforma de vendas. */
  approvedRevenueCents: number;
  refundedCents: number;
  adSpendCents: number;
  /** Taxas e custos cadastrados. Na V1 ainda não existem, então o padrão é 0. */
  feesAndCostsCents?: number;
}

/** lucro = receita aprovada − reembolsos − gasto em mídia − taxas e custos cadastrados */
export function netProfitCents(input: NetProfitInput): number {
  const { approvedRevenueCents, refundedCents, adSpendCents, feesAndCostsCents = 0 } = input;
  return approvedRevenueCents - refundedCents - adSpendCents - feesAndCostsCents;
}

/**
 * ROAS = receita ÷ gasto. Com a receita de pedidos aprovados é o ROAS real;
 * com o valor de compras que o Meta reporta é o ROAS do Meta. Os dois
 * nunca se misturam, e o lucro usa sempre o real.
 */
export function roas(revenueCents: number, adSpendCents: number): number | null {
  if (adSpendCents <= 0) return null;
  return revenueCents / adSpendCents;
}

/** CPA em centavos (arredondado) = gasto ÷ vendas. */
export function cpaCents(adSpendCents: number, sales: number): number | null {
  if (sales <= 0) return null;
  return Math.round(adSpendCents / sales);
}

/** Ticket médio em centavos (arredondado) = receita ÷ vendas. */
export function averageTicketCents(approvedRevenueCents: number, sales: number): number | null {
  if (sales <= 0) return null;
  return Math.round(approvedRevenueCents / sales);
}

/** Taxa de reembolso como fração (0,061 = 6,1%) = reembolsos ÷ receita aprovada. */
export function refundRate(refundedCents: number, approvedRevenueCents: number): number | null {
  if (approvedRevenueCents <= 0) return null;
  return refundedCents / approvedRevenueCents;
}
