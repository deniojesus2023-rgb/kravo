/**
 * Tipos de domínio da trakfy. Seguem docs/arquitetura.md:
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
export type OfferStatus = 'em_teste' | 'ativa' | 'pausada' | 'arquivada';

export interface Offer {
  id: OfferId;
  /** Prefixo usado nos nomes de campanha: OFERTA_ESTRUTURA_PÚBLICO. */
  code: string;
  name: string;
  salesPlatform: SalesPlatform;
  priceCents: number;
  /** `null` enquanto a oferta não está ligada a uma conta de anúncios. */
  adAccountName: string | null;
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

/**
 * Variação em relação ao período anterior equivalente, como fração (0,091 = +9,1%).
 * `null` quando não há base de comparação (período anterior sem dados): nunca inventamos um valor.
 */
export interface PeriodDeltas {
  spend: number | null;
  revenue: number | null;
  profit: number | null;
  roas: number | null;
  cpa: number | null;
  ticket: number | null;
}

export interface OfferPeriodData {
  offer: Offer;
  /** Há plataforma de vendas conectada para esta oferta? Sem ela, receita, lucro e ROAS real são desconhecidos. */
  salesConnected: boolean;
  /** Totais do período anterior, quando a fonte os tem (base das variações do portfólio). */
  previous: { spendCents: number; approvedRevenueCents: number; refundedCents: number; sales: number } | null;
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

export type ConnectionStatus = 'nao_conectado' | 'conectado' | 'expirando' | 'desconectado';

export interface MetaConnection {
  status: ConnectionStatus;
  /** `null` enquanto nunca houve sincronização. */
  lastSync: SyncRun | null;
}

export type PeriodId = 'hoje' | 'ontem' | '7d' | '30d' | 'personalizado';

export interface PeriodRange {
  id: PeriodId;
  /** Primeiro e último dia (inclusive), "YYYY-MM-DD" em America/Sao_Paulo. */
  start: string;
  end: string;
  /** Período anterior, com a mesma duração, usado nas variações. */
  previousStart: string;
  previousEnd: string;
  /** Ex.: "vs. 7 dias anteriores". */
  comparisonLabel: string;
}

export interface DataContext {
  currency: 'BRL';
  timezone: 'America/Sao_Paulo';
  /** Ex.: "7 dias após o clique". */
  attributionWindow: string;
  /** Período para o qual há dados (nos dados de exemplo, só os 7 dias). */
  coverage: { periodId: PeriodId; start: string; end: string } | null;
  /** Instante de referência ("agora"). Nos dados de exemplo é fixo. */
  now: string;
  /** Fim da última sincronização com o Meta Ads. `null` se nunca houve. */
  updatedAt: string | null;
  /** Verdadeiro enquanto os números vierem da camada de exemplo. */
  isSample: boolean;
  sources: string[];
}

/** Totais e indicadores de uma oferta no período, já calculados pelas regras. */
export interface OfferSummary {
  offer: Offer;
  /** Falso: receita, lucro, ROAS real, reembolso, ticket e vendas são desconhecidos (não zero). */
  salesConnected: boolean;
  period: PeriodRange;
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
  period: PeriodRange;
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
    /** Gasto só das ofertas com vendas conectadas: base do lucro e do ROAS real do portfólio. */
    spendWithSalesCents: number;
    /** Ofertas sem plataforma de vendas, fora do lucro e do ROAS real. */
    offersWithoutSales: number;
  };
  deltas: Pick<PeriodDeltas, 'spend' | 'revenue' | 'profit' | 'roas'>;
  alerts: Alert[];
}
