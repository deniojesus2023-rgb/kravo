/** Métricas do funil: impressões, cliques no link, visualizações da página, checkout e compras. */

export interface FunnelTotals {
  adSpendCents: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  checkouts: number;
  purchases: number;
}

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/** CPM em centavos = gasto ÷ impressões × 1.000. */
export const cpmCents = (t: FunnelTotals) => ratio(t.adSpendCents * 1000, t.impressions);
/** CTR no link, fração. */
export const ctr = (t: FunnelTotals) => ratio(t.linkClicks, t.impressions);
/** CPC em centavos. */
export const cpcCents = (t: FunnelTotals) => ratio(t.adSpendCents, t.linkClicks);
/** Visualizações da página ÷ cliques no link. */
export const clickToViewRate = (t: FunnelTotals) => ratio(t.landingPageViews, t.linkClicks);
/** Checkouts ÷ visualizações da página. */
export const viewToCheckoutRate = (t: FunnelTotals) => ratio(t.checkouts, t.landingPageViews);
/** Compras ÷ checkouts. */
export const checkoutToPurchaseRate = (t: FunnelTotals) => ratio(t.purchases, t.checkouts);
/** Compras ÷ visualizações da página. */
export const pageToPurchaseRate = (t: FunnelTotals) => ratio(t.purchases, t.landingPageViews);
/** Hook rate = visualizações de 3 segundos ÷ impressões (só vídeo). */
export const hookRate = (views3s: number, impressions: number) => ratio(views3s, impressions);
