import { describe, expect, it } from 'vitest';
import { addDays, eachDay, periodRange, saoPauloDate } from '@/lib/data/dates';
import { computeDeltas, relativeChange } from '@/lib/data/deltas';
import { summarizeOffer } from '@/lib/data/summarize';
import { assembleOfferPeriodData, type RawRows } from '@/lib/data/supabase/assemble';
import { DEFAULT_DECISION_PARAMS, parseDecisionParams } from '@/lib/rules';

describe('datas em America/Sao_Paulo', () => {
  it('o dia civil usa o fuso de São Paulo, não o UTC', () => {
    expect(saoPauloDate('2026-10-18T02:30:00Z')).toBe('2026-10-17'); // 23:30 em SP
    expect(saoPauloDate('2026-10-18T03:00:00Z')).toBe('2026-10-18');
  });

  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(eachDay('2026-10-29', '2026-11-02')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('janelas dos períodos e o período anterior de mesma duração', () => {
    expect(periodRange('7d', '2026-10-18')).toMatchObject({ start: '2026-10-12', end: '2026-10-18', previousStart: '2026-10-05', previousEnd: '2026-10-11', comparisonLabel: 'vs. 7 dias anteriores' });
    expect(periodRange('hoje', '2026-10-18')).toMatchObject({ start: '2026-10-18', end: '2026-10-18', previousStart: '2026-10-17', previousEnd: '2026-10-17' });
    expect(periodRange('ontem', '2026-10-18')).toMatchObject({ start: '2026-10-17', end: '2026-10-17', previousStart: '2026-10-16' });
    expect(periodRange('30d', '2026-10-18')).toMatchObject({ start: '2026-09-19', end: '2026-10-18', previousStart: '2026-08-20', previousEnd: '2026-09-18' });
    expect(periodRange('personalizado', '2026-10-18')).toBeNull();
  });
});

describe('variações', () => {
  const zero = { spendCents: 0, approvedRevenueCents: 0, refundedCents: 0, sales: 0 };

  it('sem base de comparação não há variação (nunca inventa)', () => {
    expect(computeDeltas({ spendCents: 100, approvedRevenueCents: 300, refundedCents: 0, sales: 2 }, zero)).toEqual({
      spend: null, revenue: null, profit: null, roas: null, cpa: null, ticket: null,
    });
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(null, 5)).toBeNull();
  });

  it('calcula contra o período anterior', () => {
    const d = computeDeltas(
      { spendCents: 20_000, approvedRevenueCents: 60_000, refundedCents: 0, sales: 4 },
      { spendCents: 10_000, approvedRevenueCents: 20_000, refundedCents: 0, sales: 2 },
    );
    expect(d.spend).toBeCloseTo(1); // +100%
    expect(d.revenue).toBeCloseTo(2); // +200%
    expect(d.profit).toBeCloseTo(3); // 40.000 vs 10.000
    expect(d.roas).toBeCloseTo(0.5); // 3,0x vs 2,0x
    expect(d.cpa).toBeCloseTo(0); // 5.000 vs 5.000
    expect(d.ticket).toBeCloseTo(0.5); // 15.000 vs 10.000
  });

  it('só gasto no anterior ainda é base (ROAS e CPA ficam nulos pela razão indefinida)', () => {
    const d = computeDeltas({ spendCents: 100, approvedRevenueCents: 0, refundedCents: 0, sales: 0 }, { spendCents: 50, approvedRevenueCents: 0, refundedCents: 0, sales: 0 });
    expect(d.spend).toBeCloseTo(1);
    expect(d.cpa).toBeNull();
    expect(d.ticket).toBeNull();
  });
});

describe('parseDecisionParams', () => {
  it('sem valor ou com valor inválido volta ao padrão', () => {
    expect(parseDecisionParams(null)).toEqual(DEFAULT_DECISION_PARAMS);
    expect(parseDecisionParams([1, 2])).toEqual(DEFAULT_DECISION_PARAMS);
    expect(parseDecisionParams({ scaleMinRoas: 'alto', minSales: -3, pauseMinSales: NaN })).toEqual(DEFAULT_DECISION_PARAMS);
  });

  it('aceita chaves válidas e ignora as desconhecidas', () => {
    expect(parseDecisionParams({ scaleMinRoas: 3, hack: 1 })).toEqual({ ...DEFAULT_DECISION_PARAMS, scaleMinRoas: 3 });
  });
});

describe('assembleOfferPeriodData (linhas do Supabase → dados da oferta)', () => {
  const range = periodRange('7d', '2026-10-18')!;
  const offer = { id: 'o1', code: 'VASOS', name: 'Vasos', sales_platform: 'Kiwify' as const, price_cents: 14990, status: 'em_teste' as const, decision_params: null, ad_account_id: 'acc1', sales_product_id: 'prod-vasos' };
  const rows: RawRows = {
    offers: [offer, { ...offer, id: 'o2', code: 'ARQ', name: 'Arquivada', status: 'arquivada' as never }, { ...offer, id: 'o3', code: 'VAZIA', name: 'Sem dados', ad_account_id: null }],
    adAccounts: [{ id: 'acc1', name: 'Conta 01' }],
    metrics: [
      { offer_id: 'o1', date: '2026-10-17', spend_cents: 50_000, impressions: 10_000, link_clicks: 200, landing_page_views: 150, checkouts_initiated: 30, meta_purchases: 5, meta_purchase_value_cents: 74_950 },
      { offer_id: 'o1', date: '2026-10-06', spend_cents: 25_000, impressions: 5_000, link_clicks: 100, landing_page_views: 70, checkouts_initiated: 10, meta_purchases: 2, meta_purchase_value_cents: 29_980 },
    ],
    sales: [
      { offer_id: 'o1', date: '2026-10-17', approved_orders: 4, approved_revenue_cents: 59_960, refunded_cents: 14_990 },
      { offer_id: 'o1', date: '2026-10-06', approved_orders: 2, approved_revenue_cents: 29_980, refunded_cents: 0 },
    ],
    campaigns: [{ id: 'c1', offer_id: 'o1', name: 'VASOS_CBO_ESCALA', status: 'ativa', daily_budget_cents: 20_000 }],
    campaignMetrics: [
      { entity_id: 'c1', date: '2026-10-17', spend_cents: 50_000, impressions: 10_000, link_clicks: 200 },
      { entity_id: 'c1', date: '2026-10-06', spend_cents: 25_000, impressions: 5_000, link_clicks: 100 }, // fora do período
    ],
    campaignSales: [{ campaign_id: 'c1', date: '2026-10-17', approved_orders: 4, approved_revenue_cents: 59_960 }],
    adsets: [{ id: 's1', campaign_id: 'c1' }, { id: 's2', campaign_id: 'outra' }],
    ads: [{ adset_id: 's1' }, { adset_id: 's1' }, { adset_id: 's2' }],
    salesConnections: [{ platform: 'Kiwify' as const }],
  };

  const data = assembleOfferPeriodData(range, rows);

  it('ignora ofertas arquivadas e mantém as sem movimento', () => {
    expect(data.map((d) => d.offer.id)).toEqual(['o1', 'o3']);
  });

  it('preenche todos os dias do período com zero onde não há linha', () => {
    const o1 = data[0]!;
    expect(o1.daily.map((d) => d.date)).toEqual(eachDay('2026-10-12', '2026-10-18'));
    expect(o1.daily.filter((d) => d.spendCents > 0).map((d) => d.date)).toEqual(['2026-10-17']);
    expect(o1.sales.reduce((a, s) => a + s.approvedOrders, 0)).toBe(4);
  });

  it('só soma campanhas e vendas do período, e conta conjuntos e anúncios da oferta', () => {
    const o1 = data[0]!;
    expect(o1.campaigns).toHaveLength(1);
    expect(o1.campaigns[0]).toMatchObject({ spendCents: 50_000, impressions: 10_000, linkClicks: 200, approvedOrders: 4, approvedRevenueCents: 59_960, dailyBudgetCents: 20_000 });
    expect([o1.adsetCount, o1.adCount]).toEqual([1, 2]);
  });

  it('resolve a conta de anúncios e marca rastreamento como inativo (sem integração)', () => {
    expect(data[0]!.offer.adAccountName).toBe('Conta 01');
    expect(data[1]!.offer.adAccountName).toBeNull();
    expect(data[0]!.offer.tracking).toEqual({ pixel: false, conversionsApi: false });
  });

  it('as regras e as variações saem dos totais reais', () => {
    const s = summarizeOffer(data[0]!, range);
    expect(s).toMatchObject({ spendCents: 50_000, approvedRevenueCents: 59_960, refundedCents: 14_990, sales: 4, netProfitCents: -5_030 });
    expect(s.roasReal).toBeCloseTo(59_960 / 50_000);
    expect(s.roasMeta).toBeCloseTo(74_950 / 50_000);
    expect(s.decision.action).toBe('dados_insuficientes');
    expect(s.deltas.spend).toBeCloseTo(1); // 25.000 → 50.000
  });

  it('oferta sem nenhum dado: zeros, sem razões inventadas e sem variações', () => {
    const s = summarizeOffer(data[1]!, range);
    expect([s.spendCents, s.sales, s.netProfitCents]).toEqual([0, 0, 0]);
    expect([s.roasReal, s.cpaCents, s.ticketCents, s.refundRate]).toEqual([null, null, null, null]);
    expect(s.deltas).toEqual({ spend: null, revenue: null, profit: null, roas: null, cpa: null, ticket: null });
    expect(s.decision.action).toBe('dados_insuficientes');
  });
});


describe('oferta sem plataforma de vendas conectada (receita desconhecida, não zero)', () => {
  const range = periodRange('7d', '2026-10-18')!;
  const offer = { id: 'o1', code: 'VASOS', name: 'Vasos', sales_platform: 'Hotmart' as const, price_cents: 14990, status: 'em_teste' as const, decision_params: null, ad_account_id: null };
  const rows: RawRows = {
    offers: [offer, { ...offer, id: 'o2', code: 'CROCHE', name: 'Crochê', sales_platform: 'Kiwify' as const, sales_product_id: 'prod-croche' }, { ...offer, id: 'o3', code: 'SEMPROD', name: 'Sem produto', sales_platform: 'Kiwify' as const }],
    adAccounts: [],
    metrics: [
      { offer_id: 'o1', date: '2026-10-17', spend_cents: 350_000, impressions: 90_000, link_clicks: 1_800, landing_page_views: 1_200, checkouts_initiated: 100, meta_purchases: 9, meta_purchase_value_cents: 134_910 },
      { offer_id: 'o2', date: '2026-10-17', spend_cents: 100_000, impressions: 30_000, link_clicks: 600, landing_page_views: 400, checkouts_initiated: 40, meta_purchases: 4, meta_purchase_value_cents: 24_000 },
    ],
    sales: [{ offer_id: 'o2', date: '2026-10-17', approved_orders: 20, approved_revenue_cents: 120_000, refunded_cents: 0 }],
    campaigns: [],
    campaignMetrics: [],
    campaignSales: [],
    adsets: [],
    ads: [],
    salesConnections: [{ platform: 'Kiwify' }], // só a Kiwify está conectada
  };
  const data = assembleOfferPeriodData(range, rows);

  it('marca cada oferta conforme a plataforma de vendas dela', () => {
    expect(data.map((d) => [d.offer.id, d.salesConnected])).toEqual([['o1', false], ['o2', true], ['o3', false]]);
  });

  it('plataforma conectada, mas oferta sem produto ligado: continua desconhecido (nenhum pedido chegaria a ela)', () => {
    expect(data[2]!.salesConnected).toBe(false);
  });

  it('gasto alto sem vendas conectadas NUNCA vira Pausar: vira Dados insuficientes, sem lucro nem ROAS real', () => {
    const s = summarizeOffer(data[0]!, range);
    expect(s.spendCents).toBe(350_000);
    expect(s.salesConnected).toBe(false);
    expect(s.decision.action).toBe('dados_insuficientes');
    expect(s.decision.note).toMatch(/plataforma de vendas/);
    expect(s.decision.criteria).toEqual([]);
    expect([s.roasReal, s.cpaCents, s.ticketCents, s.refundRate]).toEqual([null, null, null, null]);
    // O ROAS que o Meta reporta continua existindo, separado do real.
    expect(s.roasMeta).toBeCloseTo(134_910 / 350_000);
  });

  it('a oferta com vendas conectadas segue as regras normais', () => {
    const s = summarizeOffer(data[1]!, range);
    expect(s.salesConnected).toBe(true);
    expect(s.roasReal).toBeCloseTo(1.2);
    expect(s.decision.action).toBe('dados_insuficientes'); // 20 vendas < 30
    expect(s.decision.criteria.length).toBeGreaterThan(0);
  });
});
