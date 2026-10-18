/**
 * Pontos de partida dos dados de EXEMPLO (não são dados reais).
 * Vêm de design/screens/Main.dc.html e Oferta.dc.html. Tudo o mais
 * (série diária, funil, campanhas) é derivado em ./build.ts.
 */

import type { CampaignMetrics, PeriodDeltas, SalesPlatform } from '../types';

export interface DesignedDetail {
  dailySpendCents: number[];
  dailyRevenueCents: number[];
  funnel: { impressions: number; linkClicks: number; landingPageViews: number; checkouts: number };
  metaPurchases: number;
  campaigns: Array<
    Pick<
      CampaignMetrics,
      'name' | 'dailyBudgetCents' | 'spendCents' | 'impressions' | 'linkClicks' | 'approvedOrders'
    >
  >;
  adsetCount: number;
  adCount: number;
  deltas: PeriodDeltas;
}

export interface OfferSeed {
  id: string;
  code: string;
  name: string;
  salesPlatform: SalesPlatform;
  priceCents: number;
  adAccountName: string;
  /** Gasto no período, em centavos. */
  spendCents: number;
  /** Vendas aprovadas no período. */
  sales: number;
  /** Reembolso sobre a receita aprovada, fração. */
  refundRate: number;
  designed?: DesignedDetail;
}

const reais = (value: number) => Math.round(value * 100);

export const OFFER_SEEDS: OfferSeed[] = [
  { id: 'codigo-metabolico', code: 'METAB', name: 'Código Metabólico', salesPlatform: 'Hotmart', priceCents: reais(199), adAccountName: 'Conta de anúncios 01', spendCents: reais(6340), sales: 90, refundRate: 0.089 },
  {
    id: 'protocolo-vasos-livres',
    code: 'VASOS',
    name: 'Protocolo Vasos Livres',
    salesPlatform: 'Kiwify',
    priceCents: reais(149.9),
    adAccountName: 'Conta de anúncios 02',
    spendCents: reais(4820),
    sales: 98,
    refundRate: 0.061,
    designed: {
      dailySpendCents: [620, 660, 740, 690, 730, 760, 620].map(reais),
      // Último dia com R$ 0,20 a mais para a soma bater com 98 × R$ 149,90.
      dailyRevenueCents: [...[1780, 1950, 2240, 2010, 2310, 2480].map(reais), reais(1920.2)],
      funnel: { impressions: 412_600, linkClicks: 7_834, landingPageViews: 5_920, checkouts: 612 },
      metaPurchases: 104,
      campaigns: [
        { name: 'VASOS_CBO_ESCALA', dailyBudgetCents: reais(400), spendCents: reais(2380), impressions: 142_300, linkClicks: 2_988, approvedOrders: 54 },
        { name: 'VASOS_CBO_TESTE', dailyBudgetCents: reais(250), spendCents: reais(1410), impressions: 160_300, linkClicks: 3_046, approvedOrders: 29 },
        { name: 'VASOS_ABO_REMARKETING', dailyBudgetCents: reais(100), spendCents: reais(640), impressions: 40_000, linkClicks: 960, approvedOrders: 12 },
        { name: 'VASOS_ABO_INTERESSES', dailyBudgetCents: reais(80), spendCents: reais(390), impressions: 70_000, linkClicks: 840, approvedOrders: 3 },
      ],
      adsetCount: 11,
      adCount: 23,
      deltas: { spend: 0.091, revenue: 0.184, profit: 0.272, roas: 0.085, cpa: -0.063, ticket: 0 },
    },
  },
  { id: 'renda-com-croche', code: 'CROCHE', name: 'Renda com Crochê', salesPlatform: 'Kiwify', priceCents: reais(60), adAccountName: 'Conta de anúncios 02', spendCents: reais(1450), sales: 67, refundRate: 0.03 },
  { id: 'livro-de-enoque', code: 'ENOQUE', name: 'Livro de Enoque', salesPlatform: 'Hotmart', priceCents: reais(74.5), adAccountName: 'Conta de anúncios 01', spendCents: reais(3210), sales: 80, refundRate: 0.113 },
  { id: 'biblia-dos-moldes', code: 'MOLDES', name: 'Bíblia dos Moldes', salesPlatform: 'Eduzz', priceCents: reais(29), adAccountName: 'Conta de anúncios 03', spendCents: reais(1980), sales: 143, refundRate: 0.042 },
  { id: 'receitas-fit-7-dias', code: 'FIT7', name: 'Receitas Fit 7 Dias', salesPlatform: 'Kiwify', priceCents: reais(74), adAccountName: 'Conta de anúncios 01', spendCents: reais(640), sales: 14, refundRate: 0.071 },
  { id: 'calistenia-em-casa', code: 'CALIS', name: 'Calistenia em Casa', salesPlatform: 'Hotmart', priceCents: reais(49.5), adAccountName: 'Conta de anúncios 03', spendCents: reais(2760), sales: 70, refundRate: 0.138 },
  { id: 'jejum-inteligente', code: 'JEJUM', name: 'Jejum Inteligente', salesPlatform: 'Kiwify', priceCents: reais(75), adAccountName: 'Conta de anúncios 02', spendCents: reais(1120), sales: 18, refundRate: 0.056 },
  { id: 'ansiedade-zero', code: 'ANSIED', name: 'Ansiedade Zero', salesPlatform: 'Hotmart', priceCents: reais(199), adAccountName: 'Conta de anúncios 01', spendCents: reais(2290), sales: 9, refundRate: 0.167 },
  { id: 'ingles-em-90-dias', code: 'INGLES', name: 'Inglês em 90 Dias', salesPlatform: 'Eduzz', priceCents: reais(157), adAccountName: 'Conta de anúncios 03', spendCents: reais(3940), sales: 21, refundRate: 0.095 },
];
