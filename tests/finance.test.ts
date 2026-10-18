import { describe, expect, it } from 'vitest';
import { averageTicketCents, cpaCents, netProfitCents, refundRate, roas } from '@/lib/rules';

describe('netProfitCents', () => {
  it('lucro = receita aprovada − reembolsos − gasto em mídia', () => {
    expect(netProfitCents({ approvedRevenueCents: 1_469_020, refundedCents: 89_610, adSpendCents: 482_000 })).toBe(897_410);
  });

  it('desconta taxas e custos cadastrados quando existirem', () => {
    expect(
      netProfitCents({ approvedRevenueCents: 100_000, refundedCents: 10_000, adSpendCents: 30_000, feesAndCostsCents: 5_000 }),
    ).toBe(55_000);
  });

  it('pode ser negativo', () => {
    expect(netProfitCents({ approvedRevenueCents: 179_100, refundedCents: 29_900, adSpendCents: 229_000 })).toBe(-79_800);
  });
});

describe('razões', () => {
  it('ROAS = receita ÷ gasto', () => {
    expect(roas(1_469_020, 482_000)).toBeCloseTo(3.04776, 4);
  });

  it('devolve null quando o denominador é zero, sem inventar valor', () => {
    expect(roas(100, 0)).toBeNull();
    expect(cpaCents(100, 0)).toBeNull();
    expect(averageTicketCents(100, 0)).toBeNull();
    expect(refundRate(100, 0)).toBeNull();
  });

  it('CPA e ticket médio em centavos arredondados', () => {
    expect(cpaCents(482_000, 98)).toBe(4_918);
    expect(averageTicketCents(1_469_020, 98)).toBe(14_990);
  });

  it('taxa de reembolso é fração da receita aprovada', () => {
    expect(refundRate(61, 1_000)).toBeCloseTo(0.061);
  });
});
