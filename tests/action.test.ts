import { describe, expect, it } from 'vitest';
import { DEFAULT_DECISION_PARAMS, decideOfferAction, type ActionInput } from '@/lib/rules';

const base: ActionInput = {
  adSpendCents: 100_000,
  sales: 60,
  netProfitCents: 50_000,
  roas: 3,
  refundRate: 0.05,
};

const action = (patch: Partial<ActionInput>) => decideOfferAction({ ...base, ...patch }).action;

describe('Escalar', () => {
  it('ROAS ≥ 2,5x, ao menos 50 vendas e reembolso ≤ 10%', () => {
    expect(action({})).toBe('escalar');
  });

  it('limites exatos ainda escalam', () => {
    expect(action({ roas: 2.5, sales: 50, refundRate: 0.1 })).toBe('escalar');
  });

  it('um centésimo abaixo de qualquer limite vira Manter', () => {
    expect(action({ roas: 2.49 })).toBe('manter');
    expect(action({ sales: 49 })).toBe('manter');
    expect(action({ refundRate: 0.1001 })).toBe('manter');
  });

  it('sem ROAS (sem gasto) não escala', () => {
    expect(action({ roas: null })).toBe('manter');
  });
});

describe('Dados insuficientes', () => {
  it('menos de 30 vendas, mesmo com ROAS alto', () => {
    expect(action({ sales: 29, roas: 4 })).toBe('dados_insuficientes');
  });

  it('30 vendas já bastam para decidir', () => {
    expect(action({ sales: 30, roas: 1.5 })).toBe('manter');
  });

  it('prejuízo com poucas vendas e gasto baixo continua em Dados insuficientes', () => {
    expect(action({ sales: 12, adSpendCents: 199_999, netProfitCents: -10_000, roas: 0.7 })).toBe(
      'dados_insuficientes',
    );
  });
});

describe('Pausar', () => {
  it('prejuízo com gasto ≥ R$ 2.000, mesmo com poucas vendas', () => {
    expect(action({ sales: 9, adSpendCents: 229_000, netProfitCents: -79_800, roas: 0.78 })).toBe('pausar');
  });

  it('o gasto mínimo é inclusivo', () => {
    expect(action({ sales: 5, adSpendCents: 200_000, netProfitCents: -1 })).toBe('pausar');
    expect(action({ sales: 5, adSpendCents: 199_999, netProfitCents: -1 })).toBe('dados_insuficientes');
  });

  it('prejuízo com 30 vendas ou mais pausa, mesmo com gasto baixo', () => {
    expect(action({ sales: 30, adSpendCents: 50_000, netProfitCents: -1, roas: 0.9 })).toBe('pausar');
    expect(action({ sales: 29, adSpendCents: 50_000, netProfitCents: -1, roas: 0.9 })).toBe('dados_insuficientes');
  });

  it('lucro zero não é prejuízo', () => {
    expect(action({ sales: 40, adSpendCents: 300_000, netProfitCents: 0, roas: 1.1 })).toBe('manter');
  });

  it('Pausar tem precedência sobre os demais, mesmo com ROAS alto e reembolso pesando no lucro', () => {
    expect(action({ netProfitCents: -100, roas: 3, sales: 80, refundRate: 0.4 })).toBe('pausar');
  });
});

describe('Manter', () => {
  it('ROAS entre 1,0x e 2,5x com dados suficientes', () => {
    expect(action({ roas: 1.86, sales: 80, refundRate: 0.113 })).toBe('manter');
  });
});

describe('sem plataforma de vendas conectada', () => {
  it('nunca indica Pausar nem Escalar: sem pedidos, lucro e ROAS real são desconhecidos', () => {
    const loss = { adSpendCents: 900_000, sales: 0, netProfitCents: -900_000, roas: 0, refundRate: null, salesConnected: false };
    expect(decideOfferAction(loss).action).toBe('dados_insuficientes');
    expect(decideOfferAction({ ...base, salesConnected: false }).action).toBe('dados_insuficientes');
    // O mesmo prejuízo, com vendas conectadas, continua sendo Pausar.
    expect(decideOfferAction({ ...loss, salesConnected: true }).action).toBe('pausar');
    // Sem informar, vale como conectado (comportamento anterior).
    expect(decideOfferAction({ ...loss, salesConnected: undefined }).action).toBe('pausar');
  });
});

describe('critérios explicáveis', () => {
  it('Escalar lista ROAS, vendas e reembolso com o resultado de cada um', () => {
    const { criteria } = decideOfferAction(base);
    expect(criteria.map((c) => [c.id, c.threshold, c.met])).toEqual([
      ['roas', 2.5, true],
      ['sales', 50, true],
      ['refundRate', 0.1, true],
    ]);
  });

  it('Manter mostra quais critérios de Escalar não foram atendidos', () => {
    const { criteria } = decideOfferAction({ ...base, roas: 1.86, refundRate: 0.113 });
    expect(criteria.filter((c) => !c.met).map((c) => c.id)).toEqual(['roas', 'refundRate']);
  });

  it('Pausar mostra prejuízo, gasto e vendas, e explica a combinação', () => {
    const decision = decideOfferAction({ ...base, sales: 9, adSpendCents: 229_000, netProfitCents: -79_800, roas: 0.78 });
    expect(decision.criteria.map((c) => [c.id, c.met])).toEqual([
      ['netProfit', true],
      ['adSpend', true],
      ['sales', false],
    ]);
    expect(decision.note).toBeDefined();
  });

  it('Dados insuficientes mostra as vendas e o mínimo', () => {
    const { criteria } = decideOfferAction({ ...base, sales: 14 });
    expect(criteria).toHaveLength(1);
    expect(criteria[0]).toMatchObject({ id: 'sales', value: 14, threshold: DEFAULT_DECISION_PARAMS.minSales, met: false });
  });

  it('respeita limites configurados por oferta', () => {
    const params = { ...DEFAULT_DECISION_PARAMS, scaleMinRoas: 3.5 };
    expect(decideOfferAction(base, params).action).toBe('manter');
  });
});
