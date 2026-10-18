import { describe, expect, it } from 'vitest';
import { getOfferDetail, getOfferSummaries, getOverview } from '@/lib/data';
import { formatBRL, formatPercent, formatRoas } from '@/lib/format';
import {
  checkoutToPurchaseRate,
  clickToViewRate,
  cpcCents,
  cpmCents,
  ctr,
  pageToPurchaseRate,
  viewToCheckoutRate,
} from '@/lib/rules';

/** Valores de design/screens/Main.dc.html: [id, lucro (R$), ação]. */
const DESIGN: Array<[string, number, string]> = [
  ['codigo-metabolico', 9976, 'escalar'],
  ['protocolo-vasos-livres', 8974, 'escalar'],
  ['renda-com-croche', 2449, 'escalar'],
  ['livro-de-enoque', 2077, 'manter'],
  ['biblia-dos-moldes', 1993, 'manter'],
  ['receitas-fit-7-dias', 322, 'dados_insuficientes'],
  ['calistenia-em-casa', 227, 'manter'],
  ['jejum-inteligente', 154, 'dados_insuficientes'],
  ['ansiedade-zero', -798, 'pausar'],
  ['ingles-em-90-dias', -956, 'pausar'],
];

describe('dados de exemplo × design da Visão geral', async () => {
  const offers = (await getOfferSummaries('7d'))!;
  const overview = (await getOverview('7d'))!;

  it('ordena por lucro e reproduz lucro e ação de cada oferta', () => {
    expect(offers.map((o) => o.offer.id)).toEqual(DESIGN.map(([id]) => id));
    for (const [id, profit, action] of DESIGN) {
      const o = offers.find((x) => x.offer.id === id)!;
      expect(Math.round(o.netProfitCents / 100), id).toBe(profit);
      expect(o.decision.action, id).toBe(action);
    }
  });

  it('totais batem com o design', () => {
    const t = overview.totals;
    expect(formatBRL(t.spendCents)).toBe('R$ 28.550');
    expect(formatBRL(t.approvedRevenueCents)).toBe('R$ 57.666');
    expect(formatBRL(t.netProfitCents)).toBe('R$ 24.418');
    expect(t.sales).toBe(610);
    expect(formatBRL(t.cpaCents!, { decimals: 2 })).toBe('R$ 46,80');
    expect(formatRoas(t.roasReal)).toBe('2,02x');
    expect(formatPercent(t.refundRate!)).toBe('8,1%');
  });

  it('contagem de ações bate com os chips do design (3 · 3 · 2 · 2)', () => {
    const count = (a: string) => offers.filter((o) => o.decision.action === a).length;
    expect([count('escalar'), count('manter'), count('pausar'), count('dados_insuficientes')]).toEqual([3, 3, 2, 2]);
  });

  it('CPA, ROAS e reembolso por oferta batem com o design', () => {
    const vasos = offers.find((o) => o.offer.id === 'protocolo-vasos-livres')!;
    expect(formatBRL(vasos.cpaCents!, { decimals: 2 })).toBe('R$ 49,18');
    expect(formatRoas(vasos.roasReal)).toBe('3,05x');
    expect(formatPercent(vasos.refundRate!)).toBe('6,1%');
    const enoque = offers.find((o) => o.offer.id === 'livro-de-enoque')!;
    expect(formatRoas(enoque.roasReal)).toBe('1,86x');
    expect(formatBRL(enoque.cpaCents!, { decimals: 2 })).toBe('R$ 40,13');
  });

  it('só o período de 7 dias tem dados de exemplo', async () => {
    for (const p of ['hoje', 'ontem', '30d', 'personalizado'] as const) {
      expect(await getOverview(p)).toBeNull();
    }
  });
});

describe('dashboard de Protocolo Vasos Livres × design', async () => {
  const d = (await getOfferDetail('protocolo-vasos-livres', '7d'))!;

  it('KPIs', () => {
    expect(formatBRL(d.spendCents)).toBe('R$ 4.820');
    expect(formatBRL(d.approvedRevenueCents)).toBe('R$ 14.690');
    expect(formatBRL(d.netProfitCents)).toBe('R$ 8.974');
    expect(formatRoas(d.roasReal)).toBe('3,05x');
    expect(formatRoas(d.roasMeta)).toBe('3,23x');
    expect(formatBRL(d.ticketCents!, { decimals: 2 })).toBe('R$ 149,90');
    expect(d.metaPurchases).toBe(104);
  });

  it('série diária', () => {
    expect(d.daily.map((x) => Math.round(x.approvedRevenueCents / 100))).toEqual([1780, 1950, 2240, 2010, 2310, 2480, 1920]);
    expect(d.daily.map((x) => Math.round(x.spendCents / 100))).toEqual([620, 660, 740, 690, 730, 760, 620]);
  });

  it('funil', () => {
    const f = { adSpendCents: d.spendCents, ...d.funnel };
    expect(f).toMatchObject({ impressions: 412_600, linkClicks: 7_834, landingPageViews: 5_920, checkouts: 612, purchases: 98 });
    expect(formatBRL(cpmCents(f)!, { decimals: 2 })).toBe('R$ 11,68');
    expect(formatPercent(ctr(f)!, 2)).toBe('1,90%');
    expect(formatBRL(cpcCents(f)!, { decimals: 2 })).toBe('R$ 0,62');
    expect(formatPercent(clickToViewRate(f)!)).toBe('75,6%');
    expect(formatPercent(viewToCheckoutRate(f)!)).toBe('10,3%');
    expect(formatPercent(checkoutToPurchaseRate(f)!)).toBe('16,0%');
    expect(formatPercent(pageToPurchaseRate(f)!, 2)).toBe('1,66%');
  });

  it('campanhas', () => {
    expect(d.campaigns.map((c) => formatPercent(c.linkClicks / c.impressions))).toEqual(['2,1%', '1,9%', '2,4%', '1,2%']);
    expect(d.campaigns.map((c) => formatRoas(c.approvedRevenueCents / c.spendCents))).toEqual(['3,40x', '3,08x', '2,81x', '1,15x']);
    expect(d.campaigns.reduce((a, c) => a + c.dailyBudgetCents, 0)).toBe(83_000);
    expect([d.adsetCount, d.adCount]).toEqual([11, 23]);
  });
});

describe('invariantes de todas as ofertas', async () => {
  const offers = (await getOfferSummaries('7d'))!;

  for (const summary of offers) {
    it(`${summary.offer.id}: série, funil e campanhas somam os totais`, async () => {
      const d = (await getOfferDetail(summary.offer.id, '7d'))!;
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      expect(d.daily).toHaveLength(7);
      expect(sum(d.daily.map((x) => x.spendCents))).toBe(d.spendCents);
      expect(sum(d.daily.map((x) => x.approvedOrders))).toBe(d.sales);
      expect(sum(d.daily.map((x) => x.approvedRevenueCents))).toBe(d.approvedRevenueCents);
      expect(sum(d.campaigns.map((c) => c.spendCents))).toBe(d.spendCents);
      expect(sum(d.campaigns.map((c) => c.approvedOrders))).toBe(d.sales);
      expect(sum(d.campaigns.map((c) => c.approvedRevenueCents))).toBe(d.approvedRevenueCents);
      expect(sum(d.campaigns.map((c) => c.impressions))).toBe(d.funnel.impressions);
      expect(sum(d.campaigns.map((c) => c.linkClicks))).toBe(d.funnel.linkClicks);
    });

    it(`${summary.offer.id}: funil em ordem decrescente e Meta ≥ pedidos aprovados`, async () => {
      const f = (await getOfferDetail(summary.offer.id, '7d'))!.funnel;
      expect(f.impressions).toBeGreaterThan(f.linkClicks);
      expect(f.linkClicks).toBeGreaterThan(f.landingPageViews);
      expect(f.landingPageViews).toBeGreaterThanOrEqual(f.checkouts);
      expect(f.checkouts).toBeGreaterThanOrEqual(f.purchases);
      expect(summary.metaPurchases).toBeGreaterThanOrEqual(summary.sales);
    });
  }

  it('é determinístico: duas leituras dão o mesmo resultado', async () => {
    const a = await getOfferDetail('ansiedade-zero', '7d');
    const b = await getOfferDetail('ansiedade-zero', '7d');
    expect(a).toEqual(b);
  });
});
