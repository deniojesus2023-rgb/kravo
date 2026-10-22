/** Classificação de criativos (anúncios) de uma oferta. Puro. Limites iniciais em CLAUDE.md. */

export type CreativeTag = 'destaque' | 'revisar' | 'dados_insuficientes';

export const CREATIVE_LABELS: Record<CreativeTag, string> = {
  destaque: 'Destaque',
  revisar: 'Revisar',
  dados_insuficientes: 'Dados insuficientes',
};

export const CREATIVE_PARAMS = {
  /** Destaque: maior ROAS entre os que têm ao menos estas vendas. */
  highlightMinSales: 15,
  /** Revisar: ROAS abaixo disto com gasto a partir de `reviewMinSpendCents`. */
  reviewRoasBelow: 2,
  reviewMinSpendCents: 25_000,
  /** Dados insuficientes: gasto abaixo de `reviewMinSpendCents` e menos vendas que isto. */
  insufficientSalesBelow: 5,
};

export interface CreativeInput {
  id: string;
  spendCents: number;
  sales: number;
  /** ROAS real. `null` quando não há vendas conectadas ou gasto. */
  roas: number | null;
}

/** Uma etiqueta por criativo, ou nenhuma. Sem ROAS real não há Destaque nem Revisar (nunca se usa o ROAS do Meta). */
export function classifyCreatives(items: CreativeInput[], params = CREATIVE_PARAMS): Map<string, CreativeTag> {
  const tags = new Map<string, CreativeTag>();
  let best: CreativeInput | null = null;
  for (const c of items) {
    if (c.spendCents < params.reviewMinSpendCents && c.sales < params.insufficientSalesBelow) {
      tags.set(c.id, 'dados_insuficientes');
      continue;
    }
    if (c.roas === null) continue;
    if (c.roas < params.reviewRoasBelow && c.spendCents >= params.reviewMinSpendCents) {
      tags.set(c.id, 'revisar');
      continue;
    }
    if (c.sales >= params.highlightMinSales && (best === null || c.roas > (best.roas ?? 0))) best = c;
  }
  if (best) tags.set(best.id, 'destaque');
  return tags;
}

/** CTR no link = cliques no link ÷ impressões. */
export function linkCtr(linkClicks: number, impressions: number): number | null {
  if (impressions <= 0) return null;
  return linkClicks / impressions;
}
