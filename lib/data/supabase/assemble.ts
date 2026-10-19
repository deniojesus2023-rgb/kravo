/**
 * Monta `OfferPeriodData` a partir das linhas cruas do Supabase. Função pura (sem rede),
 * para poder ser testada. Dias sem linha viram zero: ausência de movimento não é dado faltando,
 * mas nunca preenchemos nada além de zero.
 */

import { parseDecisionParams } from '@/lib/rules';
import { eachDay } from '../dates';
import { computeDeltas, type PeriodTotals } from '../deltas';
import type { CampaignMetrics, DailyMetric, DailySales, Offer, OfferPeriodData, PeriodRange, SalesPlatform } from '../types';

export interface OfferRow {
  id: string;
  code: string;
  name: string;
  sales_platform: SalesPlatform;
  price_cents: number;
  status: Offer['status'];
  decision_params: unknown;
  ad_account_id: string | null;
  /** Produto da plataforma de vendas ligado a esta oferta. Sem ele, nenhum pedido é atribuído a ela. */
  sales_product_id?: string | null;
}
export interface MetricRow {
  offer_id: string;
  date: string;
  spend_cents: number;
  impressions: number;
  link_clicks: number;
  landing_page_views: number;
  checkouts_initiated: number;
  meta_purchases: number;
  meta_purchase_value_cents: number;
}
export interface SalesRow {
  offer_id: string;
  date: string;
  approved_orders: number;
  approved_revenue_cents: number;
  refunded_cents: number;
}
export interface CampaignRow {
  id: string;
  offer_id: string | null;
  name: string;
  status: 'ativa' | 'pausada';
  daily_budget_cents: number | null;
}
export interface CampaignMetricRow {
  entity_id: string;
  date: string;
  spend_cents: number;
  impressions: number;
  link_clicks: number;
}
export interface CampaignSalesRow {
  campaign_id: string;
  date: string;
  approved_orders: number;
  approved_revenue_cents: number;
}

export interface RawRows {
  offers: OfferRow[];
  adAccounts: Array<{ id: string; name: string }>;
  /** Métricas e vendas cobrindo o período e o anterior. */
  metrics: MetricRow[];
  sales: SalesRow[];
  campaigns: CampaignRow[];
  campaignMetrics: CampaignMetricRow[];
  campaignSales: CampaignSalesRow[];
  adsets: Array<{ id: string; campaign_id: string }>;
  ads: Array<{ adset_id: string }>;
  /** Conexões de vendas ativas (`status = conectado`): decidem se receita e lucro são conhecidos. */
  salesConnections: Array<{ platform: SalesPlatform }>;
}

const num = (v: unknown) => Number(v ?? 0);
const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

export function assembleOfferPeriodData(range: PeriodRange, rows: RawRows): OfferPeriodData[] {
  const days = eachDay(range.start, range.end);
  const accountName = new Map(rows.adAccounts.map((a) => [a.id, a.name]));
  const adsetCampaign = new Map(rows.adsets.map((a) => [a.id, a.campaign_id]));

  return rows.offers
    .filter((o) => o.status !== 'arquivada')
    .map((row) => {
      const offer: Offer = {
        id: row.id,
        code: row.code,
        name: row.name,
        salesPlatform: row.sales_platform,
        priceCents: num(row.price_cents),
        adAccountName: row.ad_account_id ? (accountName.get(row.ad_account_id) ?? null) : null,
        status: row.status,
        // Sem integração do Meta ainda: nenhum rastreamento está ativo.
        tracking: { pixel: false, conversionsApi: false },
        decisionParams: parseDecisionParams(row.decision_params),
      };

      const metrics = rows.metrics.filter((m) => m.offer_id === row.id);
      const sales = rows.sales.filter((s) => s.offer_id === row.id);
      const metricByDay = new Map(metrics.map((m) => [m.date, m]));
      const salesByDay = new Map(sales.map((s) => [s.date, s]));

      const daily: DailyMetric[] = days.map((date) => {
        const m = metricByDay.get(date);
        return {
          offerId: row.id,
          date,
          spendCents: num(m?.spend_cents),
          impressions: num(m?.impressions),
          linkClicks: num(m?.link_clicks),
          landingPageViews: num(m?.landing_page_views),
          checkouts: num(m?.checkouts_initiated),
          metaPurchases: num(m?.meta_purchases),
          metaPurchaseValueCents: num(m?.meta_purchase_value_cents),
        };
      });
      const salesDaily: DailySales[] = days.map((date) => {
        const s = salesByDay.get(date);
        return {
          offerId: row.id,
          date,
          approvedOrders: num(s?.approved_orders),
          approvedRevenueCents: num(s?.approved_revenue_cents),
          refundedCents: num(s?.refunded_cents),
        };
      });

      const previous: PeriodTotals = {
        spendCents: metrics.filter((m) => inRange(m.date, range.previousStart, range.previousEnd)).reduce((a, m) => a + num(m.spend_cents), 0),
        approvedRevenueCents: sales.filter((s) => inRange(s.date, range.previousStart, range.previousEnd)).reduce((a, s) => a + num(s.approved_revenue_cents), 0),
        refundedCents: sales.filter((s) => inRange(s.date, range.previousStart, range.previousEnd)).reduce((a, s) => a + num(s.refunded_cents), 0),
        sales: sales.filter((s) => inRange(s.date, range.previousStart, range.previousEnd)).reduce((a, s) => a + num(s.approved_orders), 0),
      };
      const current: PeriodTotals = {
        spendCents: daily.reduce((a, d) => a + d.spendCents, 0),
        approvedRevenueCents: salesDaily.reduce((a, s) => a + s.approvedRevenueCents, 0),
        refundedCents: salesDaily.reduce((a, s) => a + s.refundedCents, 0),
        sales: salesDaily.reduce((a, s) => a + s.approvedOrders, 0),
      };

      const offerCampaigns = rows.campaigns.filter((c) => c.offer_id === row.id);
      const campaigns: CampaignMetrics[] = offerCampaigns.map((c) => {
        const cm = rows.campaignMetrics.filter((m) => m.entity_id === c.id && inRange(m.date, range.start, range.end));
        const cs = rows.campaignSales.filter((s) => s.campaign_id === c.id && inRange(s.date, range.start, range.end));
        return {
          id: c.id,
          offerId: row.id,
          name: c.name,
          status: c.status,
          dailyBudgetCents: num(c.daily_budget_cents),
          spendCents: cm.reduce((a, m) => a + num(m.spend_cents), 0),
          impressions: cm.reduce((a, m) => a + num(m.impressions), 0),
          linkClicks: cm.reduce((a, m) => a + num(m.link_clicks), 0),
          approvedOrders: cs.reduce((a, s) => a + num(s.approved_orders), 0),
          approvedRevenueCents: cs.reduce((a, s) => a + num(s.approved_revenue_cents), 0),
        };
      });
      const campaignIds = new Set(offerCampaigns.map((c) => c.id));
      const offerAdsets = rows.adsets.filter((a) => campaignIds.has(a.campaign_id));
      const adsetIds = new Set(offerAdsets.map((a) => a.id));

      return {
        offer,
        // Conectar a plataforma não basta: sem o produto ligado à oferta, nenhum pedido chega a ela e o prejuízo seria falso.
        salesConnected: rows.salesConnections.some((c) => c.platform === row.sales_platform) && Boolean(row.sales_product_id),
        previous,
        daily,
        sales: salesDaily,
        campaigns,
        adsetCount: offerAdsets.length,
        adCount: rows.ads.filter((a) => adsetIds.has(a.adset_id) && adsetCampaign.has(a.adset_id)).length,
        deltas: computeDeltas(current, previous),
      };
    });
}
