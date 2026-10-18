/**
 * Gera, de forma determinística, os dados de exemplo de cada oferta a partir
 * dos totais do período. A série diária, o funil e as campanhas sempre somam
 * exatamente os totais. Os números NÃO são reais.
 */

import type {
  CampaignMetrics,
  DailyMetric,
  DailySales,
  Offer,
  OfferPeriodData,
  PeriodDeltas,
} from '../types';
import { allocate, createRng, hashString } from './random';
import type { OfferSeed } from './seeds';

export const SAMPLE_PERIOD = { start: '2026-10-12', end: '2026-10-18' } as const;
export const SAMPLE_DATES = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

const WEEKDAY_SHAPE = [0.95, 1.0, 1.05, 1.0, 1.1, 1.15, 0.95];

const STRUCTURES = ['CBO_ESCALA', 'CBO_TESTE', 'ABO_REMARKETING', 'ABO_INTERESSES'];
const CAMPAIGN_SHAPES: Record<number, { spend: number[]; sales: number[]; reach: number[]; ctr: number[] }> = {
  2: { spend: [65, 35], sales: [68, 32], reach: [1, 1], ctr: [1.1, 0.9] },
  3: { spend: [55, 30, 15], sales: [60, 32, 8], reach: [1, 1, 0.8], ctr: [1.1, 1, 1.25] },
  4: { spend: [49, 29, 13, 9], sales: [55, 30, 12, 3], reach: [1, 1, 0.8, 1.1], ctr: [1.1, 1, 1.25, 0.7] },
};

export function buildOfferPeriodData(seed: OfferSeed): OfferPeriodData {
  const rng = createRng(hashString(seed.id));
  const days = SAMPLE_DATES.length;

  const offer: Offer = {
    id: seed.id,
    code: seed.code,
    name: seed.name,
    salesPlatform: seed.salesPlatform,
    priceCents: seed.priceCents,
    adAccountName: seed.adAccountName,
    status: 'em_teste',
    tracking: { pixel: true, conversionsApi: true },
  };

  const revenueCents = seed.sales * seed.priceCents;
  const refundedCents = Math.round(revenueCents * seed.refundRate);

  // Pesos diários. Gasto varia pouco; vendas seguem o formato da semana.
  const spendWeights = Array.from({ length: days }, () => 0.9 + rng() * 0.2);
  const salesWeights = WEEKDAY_SHAPE.map((shape) => shape * (0.85 + rng() * 0.3));
  const designed = seed.designed;

  const dailySpend = designed ? designed.dailySpendCents : allocate(seed.spendCents, spendWeights);
  const dailyRevenue = designed ? designed.dailyRevenueCents : allocate(revenueCents, salesWeights);
  const dailyOrders = allocate(seed.sales, designed ? dailyRevenue : salesWeights);
  const dailyRefunds = allocate(refundedCents, dailyRevenue);

  // Funil do período.
  let funnel: { impressions: number; linkClicks: number; landingPageViews: number; checkouts: number };
  if (designed) {
    funnel = designed.funnel;
  } else {
    const cpm = 10 + rng() * 4;
    const impressions = Math.round((seed.spendCents / 100 / cpm) * 1000);
    const linkClicks = Math.round(impressions * (0.013 + rng() * 0.01));
    const landingPageViews = Math.round(linkClicks * (0.7 + rng() * 0.1));
    const wanted = Math.round(seed.sales / (0.13 + rng() * 0.1));
    const checkouts = Math.min(landingPageViews, Math.max(seed.sales, wanted));
    funnel = { impressions, linkClicks, landingPageViews, checkouts };
  }

  // Compras que o Meta reporta: normalmente um pouco acima dos pedidos aprovados.
  const metaPurchases = designed
    ? designed.metaPurchases
    : Math.max(seed.sales, Math.round(seed.sales * (1.03 + rng() * 0.07)));
  const metaValue = metaPurchases * seed.priceCents;

  const impressionsByDay = allocate(funnel.impressions, spendWeights);
  const clicksByDay = allocate(funnel.linkClicks, spendWeights);
  const viewsByDay = allocate(funnel.landingPageViews, spendWeights);
  const checkoutsByDay = allocate(funnel.checkouts, salesWeights);
  const metaPurchasesByDay = allocate(metaPurchases, salesWeights);
  const metaValueByDay = allocate(metaValue, salesWeights);

  const daily: DailyMetric[] = SAMPLE_DATES.map((date, i) => ({
    offerId: seed.id,
    date,
    spendCents: dailySpend[i] ?? 0,
    impressions: impressionsByDay[i] ?? 0,
    linkClicks: clicksByDay[i] ?? 0,
    landingPageViews: viewsByDay[i] ?? 0,
    checkouts: checkoutsByDay[i] ?? 0,
    metaPurchases: metaPurchasesByDay[i] ?? 0,
    metaPurchaseValueCents: metaValueByDay[i] ?? 0,
  }));

  const sales: DailySales[] = SAMPLE_DATES.map((date, i) => ({
    offerId: seed.id,
    date,
    approvedOrders: dailyOrders[i] ?? 0,
    approvedRevenueCents: dailyRevenue[i] ?? 0,
    refundedCents: dailyRefunds[i] ?? 0,
  }));

  // Campanhas.
  let campaigns: CampaignMetrics[];
  if (designed) {
    campaigns = designed.campaigns.map((c, i) => ({
      id: `${seed.id}-c${i + 1}`,
      offerId: seed.id,
      name: c.name,
      status: 'ativa' as const,
      dailyBudgetCents: c.dailyBudgetCents,
      spendCents: c.spendCents,
      impressions: c.impressions,
      linkClicks: c.linkClicks,
      approvedOrders: c.approvedOrders,
      approvedRevenueCents: c.approvedOrders * seed.priceCents,
    }));
  } else {
    const count = 2 + (hashString(`${seed.id}:campanhas`) % 3);
    const shape = CAMPAIGN_SHAPES[count]!;
    const spend = allocate(seed.spendCents, shape.spend);
    const orders = allocate(seed.sales, shape.sales);
    const impressions = allocate(
      funnel.impressions,
      shape.reach.map((r, i) => r * (shape.spend[i] ?? 0)),
    );
    const clicks = allocate(
      funnel.linkClicks,
      impressions.map((n, i) => n * (shape.ctr[i] ?? 1)),
    );
    campaigns = Array.from({ length: count }, (_, i) => {
      const spendCents = spend[i] ?? 0;
      return {
        id: `${seed.id}-c${i + 1}`,
        offerId: seed.id,
        name: `${seed.code}_${STRUCTURES[i]}`,
        status: 'ativa' as const,
        dailyBudgetCents: Math.max(2_000, Math.round((spendCents * 1.2) / days / 1_000) * 1_000),
        spendCents,
        impressions: impressions[i] ?? 0,
        linkClicks: clicks[i] ?? 0,
        approvedOrders: orders[i] ?? 0,
        approvedRevenueCents: (orders[i] ?? 0) * seed.priceCents,
      };
    });
  }

  const adsetCount = designed?.adsetCount ?? Math.round(campaigns.length * (2.4 + rng() * 0.8));
  const adCount = designed?.adCount ?? Math.round(adsetCount * (1.8 + rng() * 0.8));

  const profit = revenueCents - refundedCents - seed.spendCents;
  const deltas: PeriodDeltas = designed?.deltas ?? generatedDeltas(rng, profit);

  return { offer, previous: null, daily, sales, campaigns, adsetCount, adCount, deltas };
}

function generatedDeltas(rng: () => number, profit: number): PeriodDeltas {
  const spend = -0.08 + rng() * 0.3;
  const revenue = spend + (rng() - 0.4) * 0.2;
  return {
    spend,
    revenue,
    profit: profit < 0 ? -(0.1 + rng() * 0.4) : revenue * 1.4,
    roas: (1 + revenue) / (1 + spend) - 1,
    cpa: (1 + spend) / (1 + revenue) - 1,
    ticket: 0,
  };
}
