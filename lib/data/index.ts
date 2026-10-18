/**
 * Único ponto de entrada de dados para as telas. Escolhe a fonte por requisição:
 * Supabase (dados reais do usuário logado, com RLS) quando a autenticação está configurada,
 * ou a camada de exemplo. As telas e as regras não sabem qual das duas está em uso.
 */

import { cache } from 'react';
import { cpaCents, netProfitCents, refundRate, roas } from '@/lib/rules';
import { createClient } from '@/lib/supabase/server';
import { sampleSource } from './sample/source';
import { summarizeOffer } from './summarize';
import { supabaseSource } from './supabase/source';
import type { DataSource } from './source';
import type {
  DailyMetric,
  OfferDetail,
  OfferPeriodData,
  OfferSummary,
  Overview,
  PeriodId,
  PeriodRange,
} from './types';

export * from './types';
export * from './periods';

const getSource = cache(async (): Promise<DataSource> => {
  const supabase = await createClient();
  return supabase ? supabaseSource(supabase) : sampleSource;
});

/** Dados do período, lidos uma única vez por requisição. `null` quando não há dados para o período. */
const loadPeriod = cache(async (period: PeriodId) => {
  const source = await getSource();
  const range = source.range(period, new Date());
  if (!range) return null;
  const data = await source.offerPeriodData(range);
  const summaries = data
    .map((d) => summarizeOffer(d, range))
    .sort((a, b) => b.netProfitCents - a.netProfitCents || a.offer.name.localeCompare(b.offer.name, 'pt-BR'));
  return { source, range, data, summaries };
});

export const getContext = cache(async () => (await getSource()).context());
export const getMetaConnection = cache(async () => (await getSource()).metaConnection());

export async function getOffer(id: string) {
  const offers = await (await getSource()).offers();
  return offers.find((o) => o.id === id) ?? null;
}

/** Ofertas do período, ordenadas por lucro líquido (maior primeiro). `null` quando não há dados para o período. */
export async function getOfferSummaries(period: PeriodId): Promise<OfferSummary[] | null> {
  return (await loadPeriod(period))?.summaries ?? null;
}

export async function getOverview(period: PeriodId): Promise<Overview | null> {
  const loaded = await loadPeriod(period);
  if (!loaded) return null;
  const { source, range, data, summaries } = loaded;
  const sum = (pick: (o: OfferSummary) => number) => summaries.reduce((acc, o) => acc + pick(o), 0);
  const spendCents = sum((o) => o.spendCents);
  const approvedRevenueCents = sum((o) => o.approvedRevenueCents);
  const refundedCents = sum((o) => o.refundedCents);
  const sales = sum((o) => o.sales);
  return {
    period: range,
    offers: summaries,
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
    deltas: source.portfolioDeltas(data),
    alerts: await source.alerts(),
  };
}

export async function getOfferDetail(id: string, period: PeriodId): Promise<OfferDetail | null> {
  const loaded = await loadPeriod(period);
  const data: OfferPeriodData | undefined = loaded?.data.find((d) => d.offer.id === id);
  if (!loaded || !data) return null;
  const summary = summarizeOffer(data, loaded.range);
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

export type { PeriodRange };
