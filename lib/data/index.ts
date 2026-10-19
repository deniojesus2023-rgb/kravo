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
    // Com vendas conectadas primeiro, por lucro. Sem vendas, o lucro é desconhecido: vão depois, por gasto.
    .sort((a, b) =>
      a.salesConnected !== b.salesConnected
        ? a.salesConnected
          ? -1
          : 1
        : a.salesConnected
          ? b.netProfitCents - a.netProfitCents || a.offer.name.localeCompare(b.offer.name, 'pt-BR')
          : b.spendCents - a.spendCents || a.offer.name.localeCompare(b.offer.name, 'pt-BR'),
    );
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
  // Lucro e ROAS real do portfólio só entram com ofertas que têm plataforma de vendas conectada.
  const withSales = summaries.filter((o) => o.salesConnected);
  const sumKnown = (pick: (o: OfferSummary) => number) => withSales.reduce((acc, o) => acc + pick(o), 0);
  const approvedRevenueCents = sumKnown((o) => o.approvedRevenueCents);
  const refundedCents = sumKnown((o) => o.refundedCents);
  const sales = sumKnown((o) => o.sales);
  const spendWithSalesCents = sumKnown((o) => o.spendCents);
  return {
    period: range,
    offers: summaries,
    totals: {
      spendCents,
      approvedRevenueCents,
      refundedCents,
      sales,
      netProfitCents: netProfitCents({ approvedRevenueCents, refundedCents, adSpendCents: spendWithSalesCents }),
      roasReal: withSales.length > 0 ? roas(approvedRevenueCents, spendWithSalesCents) : null,
      cpaCents: withSales.length > 0 ? cpaCents(spendWithSalesCents, sales) : null,
      refundRate: withSales.length > 0 ? refundRate(refundedCents, approvedRevenueCents) : null,
      spendWithSalesCents,
      offersWithoutSales: summaries.length - withSales.length,
    },
    // Com ofertas sem vendas conectadas, receita, lucro e ROAS do portfólio não têm base comparável.
    deltas:
      summaries.length - withSales.length > 0
        ? { ...source.portfolioDeltas(data), revenue: null, profit: null, roas: null }
        : source.portfolioDeltas(data),
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
