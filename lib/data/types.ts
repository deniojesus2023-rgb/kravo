/**
 * Tipos de domínio da kavro. Seguem docs/arquitetura.md:
 * - `Offer` ↔ tabela `offers`
 * - `DailyMetric` ↔ `daily_metrics` (lado Meta: gasto, impressões, cliques, compras reportadas)
 * - `DailySales` ↔ `orders` agregados por dia (lado plataforma de vendas)
 * - `CampaignMetrics` ↔ `campaigns` + `daily_metrics` no nível de campanha
 * - `Alert`, `SyncRun`, `MetaConnection` ↔ `alerts`, `sync_runs`, `meta_connections`
 *
 * Todo valor monetário está em centavos de BRL (inteiros). Datas são
 * "YYYY-MM-DD" no fuso America/Sao_Paulo; instantes são ISO 8601 com offset.
 */

import type { ActionDecision, DecisionParams } from '@/lib/rules';

export type OfferId = string;
export type SalesPlatform = 'Hotmart' | 'Kiwify' | 'Eduzz' | 'Shopify';
export type OfferStatus = 'em_teste' | 'ativa' | 'pausada';

export interface Offer {
  id: OfferId;
  /** Prefixo usado nos nomes de campanha: OFERTA_ESTRUTURA_PÚBLICO. */
  code: string;
  name: string;
  salesPlatform: SalesPlatform;
  priceCents: number;
  adAccountName: string;
  status: OfferStatus;
  tracking: { pixel: boolean; conversionsApi: boolean };
  /** Limites de decisão desta oferta. Ausente = padrão do sistema. */
  decisionParams?: DecisionParams;
}

export interface DailyMetric {
  offerId: OfferId;
  date: string;
  spendCents: number;
  impressions: number;
  linkClicks: number;
  landingPageViews: number;
  checkouts: number;
  /** Compras que o Meta reporta (pode divergir dos pedidos aprovados). */
  metaPurchases: number;
  metaPurchaseValueCents: number;
}

export interface DailySales {
  offerId: OfferId;
  date: string;
  approvedOrders: number;
  approvedRevenueCents: number;
  refundedCents: number;
}

export type CampaignStatus = 'ativa' | 'pausada';

export interface CampaignMetrics {
  id: string;
  offerId: OfferId;
  /** Padrão OFERTA_ESTRUTURA_PÚBLICO. */
  name: string;
  status: CampaignStatus;
  dailyBudgetCents: number;
  spendCents: number;
  impressions: number;
  linkClicks: number;
  /** Pedidos aprovados atribuídos por UTM. */
  approvedOrders: number;
  approvedRevenueCents: number;
}

/** Variação em relação ao período anterior equivalente, como fração (0,091 = +9,1%). */
export interface PeriodDeltas {
  spend: number;
  revenue: number;
  profit: number;
  roas: number;
  cpa: number;
  ticket: number;
}

export interface OfferPeriodData {
  offer: Offer;
  daily: DailyMetric[];
  sales: DailySales[];
  campaigns: CampaignMetrics[];
  adsetCount: number;
  adCount: number;
  deltas: PeriodDeltas;
}

export type AlertSeverity = 'baixa' | 'media' | 'alta';

export interface Alert {
  id: string;
  offerId: OfferId;
  severity: AlertSeverity;
  reason: string;
  recommendedAction: string;
  source: string;
  updatedAt: string;
}

export interface SyncRun {
  source: string;
  finishedAt: string;
  delayMinutes: number;
  ok: boolean;
}

export type ConnectionStatus = 'conectado' | 'expirando' | 'desconectado';

export interface MetaConnection {
  status: ConnectionStatus;
  lastSync: SyncRun;
}

export type PeriodId = 'hoje' | 'ontem' | '7d' | '30d' | 'personalizado';

export interface DataContext {
  currency: 'BRL';
  timezone: 'America/Sao_Paulo';
  /** Instante de referência dos dados de exemplo ("agora"). */
  now: string;
  /** Verdadeiro enquanto os números vierem da camada de exemplo. */
  isSample: boolean;
  sources: string[];
}

/** Totais e indicadores de uma oferta no período, já calculados pelas regras. */
export interface OfferSummary {
  offer: Offer;
  period: { id: PeriodId; start: string; end: string };
  spendCents: number;
  approvedRevenueCents: number;
  refundedCents: number;
  sales: number;
  netProfitCents: number;
  roasReal: number | null;
  roasMeta: number | null;
  metaPurchases: number;
  metaPurchaseValueCents: number;
  cpaCents: number | null;
  ticketCents: number | null;
  refundRate: number | null;
  decision: ActionDecision;
  deltas: PeriodDeltas;
}

export interface OfferDetail extends OfferSummary {
  daily: Array<DailyMetric & { approvedOrders: number; approvedRevenueCents: number }>;
  funnel: {
    impressions: number;
    linkClicks: number;
    landingPageViews: number;
    checkouts: number;
    purchases: number;
  };
  campaigns: CampaignMetrics[];
  adsetCount: number;
  adCount: number;
}

export interface Overview {
  period: OfferSummary['period'];
  offers: OfferSummary[];
  totals: {
    spendCents: number;
    approvedRevenueCents: number;
    refundedCents: number;
    sales: number;
    netProfitCents: number;
    roasReal: number | null;
    cpaCents: number | null;
    refundRate: number | null;
  };
  deltas: Pick<PeriodDeltas, 'spend' | 'revenue' | 'profit' | 'roas'>;
  alerts: Alert[];
}
