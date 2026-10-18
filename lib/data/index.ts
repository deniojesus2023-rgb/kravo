/**
 * Único ponto de entrada de dados para as telas. Hoje lê a camada de exemplo
 * (./sample); trocar pela fonte real significa reescrever só este arquivo e a
 * pasta sample/, sem mexer nas telas. As funções são assíncronas de propósito.
 */

import { netProfitCents, refundRate, roas, cpaCents } from '@/lib/rules';
import { DEFAULT_PERIOD } from './periods';
import {
  SAMPLE_ALERTS,
  SAMPLE_META_CONNECTION,
  SAMPLE_NOW,
  SAMPLE_OFFERS,
  SAMPLE_PORTFOLIO_DELTAS,
  SAMPLE_SOURCES,
} from './sample';
import { SAMPLE_PERIOD } from './sample/build';
import { summarizeOffer } from './summarize';
import type {
  DailyMetric,
  DataContext,
  MetaConnection,
  Offer,
  OfferDetail,
  OfferSummary,
  Overview,
  PeriodId,
} from './types';

export * from './types';
export * from './periods';

/** Só o período de 7 dias tem dados de exemplo. */
function periodFor(id: PeriodId) {
  return id === DEFAULT_PERIOD ? { id, ...SAMPLE_PERIOD } : null;
}

export async function getContext(): Promise<DataContext> {
  return { currency: 'BRL', timezone: 'America/Sao_Paulo',
    attributionWindow: '7 dias após o clique',
    coverage: { periodId: DEFAULT_PERIOD, ...SAMPLE_PERIOD },
    now: SAMPLE_NOW, isSample: true, sources: SAMPLE_SOURCES };
}

export async function getMetaConnection(): Promise<MetaConnection> {
  return SAMPLE_META_CONNECTION;
}

export async function getOffer(id: string): Promise<Offer | null> {
  return SAMPLE_OFFERS.find((o) => o.offer.id === id)?.offer ?? null;
}

/** Ofertas do período, ordenadas por lucro líquido (maior primeiro). `null` quando não há dados. */
export async function getOfferSummaries(period: PeriodId): Promise<OfferSummary[] | null> {
  const range = periodFor(period);
  if (!range) return null;
  return SAMPLE_OFFERS.map((data) => summarizeOffer(data, range)).sort(
    (a, b) => b.netProfitCents - a.netProfitCents,
  );
}

export async function getOverview(period: PeriodId): Promise<Overview | null> {
  const offers = await getOfferSummaries(period);
  if (!offers) return null;
  const sum = (pick: (o: OfferSummary) => number) => offers.reduce((acc, o) => acc + pick(o), 0);
  const spendCents = sum((o) => o.spendCents);
  const approvedRevenueCents = sum((o) => o.approvedRevenueCents);
  const refundedCents = sum((o) => o.refundedCents);
  const sales = sum((o) => o.sales);
  return {
    period: offers[0]!.period,
    offers,
    totals: {
      spendCents,
      approvedRevenueCents,
      refundedCents,
      sales,
      netProfitCents: netProfitCents({ approvedRevenueCents, refundedCents, adSpendCents: spendCents }),
      roasReal: roas(approvedRevenueCents, spendCents),
      cpaCents: cpaCents(spendCents, sales),
      refundRate: refundRate(refundedCents, approvedRevenueCents),
    },
    deltas: SAMPLE_PORTFOLIO_DELTAS,
    alerts: SAMPLE_ALERTS,
  };
}

export async function getOfferDetail(id: string, period: PeriodId): Promise<OfferDetail | null> {
  const range = periodFor(period);
  const data = SAMPLE_OFFERS.find((o) => o.offer.id === id);
  if (!range || !data) return null;
  const summary = summarizeOffer(data, range);
  const sum = (pick: (d: DailyMetric) => number) => data.daily.reduce((acc, d) => acc + pick(d), 0);
  return {
    ...summary,
    daily: data.daily.map((d, i) => ({
      ...d,
      approvedOrders: data.sales[i]?.approvedOrders ?? 0,
      approvedRevenueCents: data.sales[i]?.approvedRevenueCents ?? 0,
    })),
    funnel: {
      impressions: sum((d) => d.impressions),
      linkClicks: sum((d) => d.linkClicks),
      landingPageViews: sum((d) => d.landingPageViews),
      checkouts: sum((d) => d.checkouts),
      purchases: summary.sales,
    },
    campaigns: data.campaigns,
    adsetCount: data.adsetCount,
    adCount: data.adCount,
  };
}
