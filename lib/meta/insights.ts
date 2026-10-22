/**
 * Leitura das métricas do Meta Ads (Graph API `insights`). Funções puras: sem rede, testáveis.
 * Todos os campos pedidos funcionam só com `ads_read`.
 */

import { addDays } from '@/lib/data/dates';

const METRIC_FIELDS = ['spend', 'impressions', 'reach', 'inline_link_clicks', 'actions', 'action_values', 'account_currency'] as const;

export type InsightLevel = 'campaign' | 'adset' | 'ad';

/** Campos de `insights` por nível. Todos funcionam só com `ads_read`. */
export const INSIGHT_FIELDS_BY_LEVEL = {
  campaign: ['campaign_id', 'campaign_name', ...METRIC_FIELDS],
  adset: ['campaign_id', 'adset_id', 'adset_name', ...METRIC_FIELDS],
  ad: ['campaign_id', 'adset_id', 'ad_id', 'ad_name', ...METRIC_FIELDS],
} as const;
export const INSIGHT_FIELDS = INSIGHT_FIELDS_BY_LEVEL.campaign;

export const CAMPAIGN_FIELDS = ['id', 'name', 'effective_status', 'daily_budget'] as const;
export const ADSET_FIELDS = ['id', 'name', 'effective_status', 'campaign_id'] as const;
export const AD_FIELDS = ['id', 'name', 'effective_status', 'adset_id', 'campaign_id'] as const;

/** Janela de atribuição das ações e valores. Bate com o texto mostrado na interface. */
export const ATTRIBUTION_WINDOW = '7d_click';

interface ActionEntry {
  action_type?: string;
  value?: string;
  [window: string]: unknown;
}

export interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: ActionEntry[];
  action_values?: ActionEntry[];
  account_currency?: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  effective_status?: string;
  daily_budget?: string;
}

export interface MetaAdset {
  id: string;
  name: string;
  effective_status?: string;
  campaign_id?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
}

export interface ParsedInsight {
  campaignId: string;
  campaignName: string;
  /** Dia no fuso da conta de anúncios, "YYYY-MM-DD". */
  date: string;
  currency: string | null;
  spendCents: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  /** Reproduções de vídeo de 3 segundos (ação `video_view`). */
  videoViews3s: number;
  checkouts: number;
  purchases: number;
  purchaseValueCents: number;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const int = (value: unknown) => Math.round(num(value));
/** "123.45" (unidade da moeda) → centavos. */
export const toCents = (value: unknown) => Math.round(num(value) * 100);

/**
 * Valor de uma ação. Prefere a janela de atribuição pedida; sem ela, o `value` padrão. Quando há mais de um
 * tipo equivalente (ex.: `purchase` e `omni_purchase`), usa só o primeiro presente, para não contar em dobro.
 */
function actionValue(list: ActionEntry[] | undefined, types: string[]): number {
  if (!Array.isArray(list)) return 0;
  for (const type of types) {
    const entry = list.find((a) => a.action_type === type);
    if (entry) return num(entry[ATTRIBUTION_WINDOW] ?? entry.value);
  }
  return 0;
}

export function parseInsightRow(row: InsightRow): ParsedInsight | null {
  if (!row.campaign_id || !row.date_start || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_start)) return null;
  return {
    campaignId: String(row.campaign_id),
    campaignName: String(row.campaign_name ?? row.campaign_id),
    date: row.date_start,
    currency: row.account_currency ?? null,
    spendCents: toCents(row.spend),
    impressions: int(row.impressions),
    reach: int(row.reach),
    linkClicks: int(row.inline_link_clicks),
    landingPageViews: Math.round(actionValue(row.actions, ['landing_page_view'])),
    videoViews3s: Math.round(actionValue(row.actions, ['video_view'])),
    checkouts: Math.round(actionValue(row.actions, ['initiate_checkout', 'omni_initiated_checkout'])),
    purchases: Math.round(actionValue(row.actions, ['purchase', 'omni_purchase'])),
    purchaseValueCents: Math.round(actionValue(row.action_values, ['purchase', 'omni_purchase']) * 100),
  };
}

export interface ParsedEntityInsight extends ParsedInsight {
  /** Id da entidade na Meta: campanha, conjunto ou anúncio, conforme o nível. */
  entityId: string;
  adsetId: string | null;
}

/** Linha de insights de qualquer nível. A mesma leitura de números; só muda qual id identifica a linha. */
export function parseEntityInsight(row: InsightRow, level: InsightLevel): ParsedEntityInsight | null {
  const entityId = level === 'campaign' ? row.campaign_id : level === 'adset' ? row.adset_id : row.ad_id;
  const name = level === 'campaign' ? row.campaign_name : level === 'adset' ? row.adset_name : row.ad_name;
  if (!entityId || !row.campaign_id) return null;
  const base = parseInsightRow({ ...row, campaign_id: row.campaign_id });
  if (!base) return null;
  return { ...base, entityId: String(entityId), campaignName: String(name ?? entityId), adsetId: row.adset_id ? String(row.adset_id) : null };
}

export const campaignStatus = (effective: string | undefined): 'ativa' | 'pausada' => (effective === 'ACTIVE' ? 'ativa' : 'pausada');

/** Orçamento diário em centavos (a Meta devolve a menor unidade da moeda). `null` quando não há. */
export function dailyBudgetCents(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Janela a sincronizar. Na primeira vez, 30 dias. Depois, os últimos 7 dias, porque a Meta reajusta os números
 * de atribuição por alguns dias. `today` é o dia de hoje em America/Sao_Paulo.
 */
export function planWindow(today: string, firstSync: boolean, light = false): { since: string; until: string } {
  // Leitura leve (a cada poucos minutos): só o dia de hoje. A completa da noite corrige os últimos 7 dias.
  if (light) return { since: today, until: today };
  return { since: addDays(today, firstSync ? -29 : -6), until: today };
}
