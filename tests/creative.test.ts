import { describe, expect, it } from 'vitest';
import { classifyCreatives, linkCtr } from '@/lib/rules';

const c = (id: string, spendCents: number, sales: number, roas: number | null) => ({ id, spendCents, sales, roas });

describe('classificação de criativos', () => {
  it('Destaque é só o maior ROAS entre os com 15 vendas ou mais', () => {
    const t = classifyCreatives([c('a', 100_000, 31, 3.7), c('b', 90_000, 22, 3.4), c('c', 40_000, 9, 4.5)]);
    expect(t.get('a')).toBe('destaque');
    expect(t.has('b')).toBe(false);
    expect(t.has('c')).toBe(false);
  });
  it('Revisar: ROAS abaixo de 2,0x com gasto a partir de R$ 250', () => {
    const t = classifyCreatives([c('a', 25_000, 3, 1.8), c('b', 24_999, 5, 1.0), c('d', 38_000, 5, 1.97)]);
    expect(t.get('a')).toBe('revisar');
    expect(t.has('b')).toBe(false);
    expect(t.get('d')).toBe('revisar');
  });
  it('Dados insuficientes: gasto abaixo de R$ 250 e menos de 5 vendas', () => {
    const t = classifyCreatives([c('a', 14_000, 0, 0), c('b', 14_000, 5, 2)]);
    expect(t.get('a')).toBe('dados_insuficientes');
    expect(t.has('b')).toBe(false);
  });
  it('sem ROAS real não há Destaque nem Revisar', () => {
    const t = classifyCreatives([c('a', 100_000, 0, null)]);
    expect(t.size).toBe(0);
  });
  it('Revisar vence Destaque quando o melhor ainda está abaixo de 2,0x', () => {
    const t = classifyCreatives([c('a', 100_000, 20, 1.5)]);
    expect(t.get('a')).toBe('revisar');
  });
  it('CTR', () => {
    expect(linkCtr(24, 1000)).toBe(0.024);
    expect(linkCtr(1, 0)).toBeNull();
  });
});
