import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataSource } from '../source';
import { computeDeltas, type PeriodTotals } from '../deltas';
import { periodRange, saoPauloDate } from '../dates';
import type { Alert, ConnectionStatus, Offer, SyncRun } from '../types';
import {
  assembleOfferPeriodData,
  type CampaignMetricRow,
  type CampaignRow,
  type CampaignSalesRow,
  type MetricRow,
  type OfferRow,
  type SalesRow,
} from './assemble';

const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** O PostgREST devolve no máximo 1.000 linhas por chamada; busca todas as páginas. */
async function fetchAll<T>(table: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    // Só o nome da tabela e a mensagem do banco; nunca dados do usuário.
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const OFFER_COLUMNS = 'id, code, name, sales_platform, price_cents, status, decision_params, ad_account_id';

export function supabaseSource(supabase: SupabaseClient): DataSource {
  const offerRows = () =>
    fetchAll<OfferRow>('offers', (a, b) =>
      supabase.from('offers').select(OFFER_COLUMNS).neq('status', 'arquivada').order('created_at').order('id').range(a, b),
    );

  const adAccountRows = () =>
    fetchAll<{ id: string; name: string }>('ad_accounts', (a, b) => supabase.from('ad_accounts').select('id, name').order('id').range(a, b));

  async function lastSync(): Promise<SyncRun | null> {
    const { data, error } = await supabase
      .from('sync_runs')
      .select('source, finished_at, delay_seconds, ok')
      .eq('source', 'Meta Ads')
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`Falha ao ler sync_runs: ${error.message}`);
    const row = data?.[0];
    return row
      ? { source: row.source, finishedAt: row.finished_at, delayMinutes: Math.round((row.delay_seconds ?? 0) / 60), ok: Boolean(row.ok) }
      : null;
  }

  async function metaConnection() {
    const { data, error } = await supabase.from('meta_connections').select('status').order('created_at', { ascending: false }).limit(1);
    if (error) throw new Error(`Falha ao ler meta_connections: ${error.message}`);
    const status: ConnectionStatus = (data?.[0]?.status as ConnectionStatus | undefined) ?? 'nao_conectado';
    return { status, lastSync: status === 'nao_conectado' ? null : await lastSync() };
  }

  return {
    isSample: false,

    async context() {
      const [connection, sales] = await Promise.all([
        metaConnection(),
        supabase.from('sales_connections').select('platform').eq('status', 'conectado'),
      ]);
      if (sales.error) throw new Error(`Falha ao ler sales_connections: ${sales.error.message}`);
      const sources = [
        ...(connection.status === 'conectado' || connection.status === 'expirando' ? ['Meta Ads'] : []),
        ...[...new Set((sales.data ?? []).map((r) => r.platform as string))],
      ];
      return {
        currency: 'BRL' as const,
        timezone: 'America/Sao_Paulo' as const,
        attributionWindow: '7 dias após o clique',
        coverage: null,
        now: new Date().toISOString(),
        updatedAt: connection.lastSync?.finishedAt ?? null,
        isSample: false,
        sources,
      };
    },

    metaConnection,

    range: (period, now) => periodRange(period, saoPauloDate(now)),

    async offers(): Promise<Offer[]> {
      const [rows, adAccounts] = await Promise.all([offerRows(), adAccountRows()]);
      const range = periodRange('7d', saoPauloDate(new Date()))!;
      return assembleOfferPeriodData(range, { ...emptyRows(rows), adAccounts }).map((d) => d.offer);
    },

    async offerPeriodData(range) {
      const [offers, adAccounts, campaigns, adsets, ads] = await Promise.all([
        offerRows(),
        adAccountRows(),
        fetchAll<CampaignRow>('campaigns', (a, b) =>
          supabase.from('campaigns').select('id, offer_id, name, status, daily_budget_cents').not('offer_id', 'is', null).order('id').range(a, b),
        ),
        fetchAll<{ id: string; campaign_id: string }>('adsets', (a, b) => supabase.from('adsets').select('id, campaign_id').order('id').range(a, b)),
        fetchAll<{ adset_id: string }>('ads', (a, b) => supabase.from('ads').select('adset_id').order('id').range(a, b)),
      ]);

      const [metrics, sales, campaignMetrics, campaignSales] = await Promise.all([
        fetchAll<MetricRow>('offer_daily_metrics', (a, b) =>
          supabase
            .from('offer_daily_metrics')
            .select('offer_id, date, spend_cents, impressions, link_clicks, landing_page_views, checkouts_initiated, meta_purchases, meta_purchase_value_cents')
            .gte('date', range.previousStart)
            .lte('date', range.end)
            .order('date')
            .order('offer_id')
            .range(a, b),
        ),
        fetchAll<SalesRow>('offer_daily_sales', (a, b) =>
          supabase
            .from('offer_daily_sales')
            .select('offer_id, date, approved_orders, approved_revenue_cents, refunded_cents')
            .gte('date', range.previousStart)
            .lte('date', range.end)
            .order('date')
            .order('offer_id')
            .range(a, b),
        ),
        fetchAll<CampaignMetricRow>('daily_metrics', (a, b) =>
          supabase
            .from('daily_metrics')
            .select('entity_id, date, spend_cents, impressions, link_clicks')
            .eq('level', 'campaign')
            .gte('date', range.start)
            .lte('date', range.end)
            .order('date')
            .order('entity_id')
            .range(a, b),
        ),
        fetchAll<CampaignSalesRow>('campaign_daily_sales', (a, b) =>
          supabase
            .from('campaign_daily_sales')
            .select('campaign_id, date, approved_orders, approved_revenue_cents')
            .gte('date', range.start)
            .lte('date', range.end)
            .order('date')
            .order('campaign_id')
            .range(a, b),
        ),
      ]);

      return assembleOfferPeriodData(range, { offers, adAccounts, metrics, sales, campaigns, campaignMetrics, campaignSales, adsets, ads });
    },

    portfolioDeltas(data) {
      const sum = (pick: (t: PeriodTotals) => number, source: 'current' | 'previous') =>
        data.reduce((acc, d) => {
          const t: PeriodTotals =
            source === 'previous'
              ? (d.previous ?? { spendCents: 0, approvedRevenueCents: 0, refundedCents: 0, sales: 0 })
              : {
                  spendCents: d.daily.reduce((a, x) => a + x.spendCents, 0),
                  approvedRevenueCents: d.sales.reduce((a, x) => a + x.approvedRevenueCents, 0),
                  refundedCents: d.sales.reduce((a, x) => a + x.refundedCents, 0),
                  sales: d.sales.reduce((a, x) => a + x.approvedOrders, 0),
                };
          return acc + pick(t);
        }, 0);
      const totals = (source: 'current' | 'previous'): PeriodTotals => ({
        spendCents: sum((t) => t.spendCents, source),
        approvedRevenueCents: sum((t) => t.approvedRevenueCents, source),
        refundedCents: sum((t) => t.refundedCents, source),
        sales: sum((t) => t.sales, source),
      });
      const { spend, revenue, profit, roas } = computeDeltas(totals('current'), totals('previous'));
      return { spend, revenue, profit, roas };
    },

    async alerts(): Promise<Alert[]> {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, offer_id, severity, reason, recommended_action, source, updated_at')
        .is('resolved_at', null)
        .order('updated_at', { ascending: false })
        .limit(5);
      if (error) throw new Error(`Falha ao ler alerts: ${error.message}`);
      return (data ?? []).map((r) => ({
        id: r.id,
        offerId: r.offer_id ?? '',
        severity: r.severity,
        reason: r.reason,
        recommendedAction: r.recommended_action,
        source: r.source,
        updatedAt: r.updated_at,
      }));
    },
  };
}

function emptyRows(offers: OfferRow[]) {
  return { offers, adAccounts: [], metrics: [], sales: [], campaigns: [], campaignMetrics: [], campaignSales: [], adsets: [], ads: [] };
}
