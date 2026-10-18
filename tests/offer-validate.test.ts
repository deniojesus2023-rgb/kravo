import { describe, expect, it } from 'vitest';
import { parsePriceToCents, validateOffer } from '@/lib/offers/validate';

describe('parsePriceToCents', () => {
  it('aceita formatos brasileiros e simples', () => {
    expect(parsePriceToCents('149,90')).toBe(14990);
    expect(parsePriceToCents('R$ 149,90')).toBe(14990);
    expect(parsePriceToCents('1.499,90')).toBe(149990);
    expect(parsePriceToCents('149.90')).toBe(14990);
    expect(parsePriceToCents('149')).toBe(14900);
    expect(parsePriceToCents('1.499')).toBe(149900);
    expect(parsePriceToCents('0,5')).toBe(50);
  });

  it('rejeita entradas inválidas', () => {
    for (const bad of ['', 'abc', '-10', '10,999', '1,2,3', '12,3x', '1..000', ',50', 'NaN']) {
      expect(parsePriceToCents(bad), bad).toBeNull();
    }
  });
});

const valid = { name: 'Protocolo Vasos Livres', code: 'vasos', salesPlatform: 'Kiwify', price: '149,90', checkoutUrl: '' };

describe('validateOffer', () => {
  it('normaliza e aceita uma oferta válida', () => {
    expect(validateOffer({ ...valid, name: '  Protocolo   Vasos Livres ' })).toEqual({
      ok: true,
      value: { name: 'Protocolo Vasos Livres', code: 'VASOS', salesPlatform: 'Kiwify', priceCents: 14990, checkoutUrl: null },
    });
  });

  it('aceita link de checkout http(s) e rejeita o resto', () => {
    expect(validateOffer({ ...valid, checkoutUrl: 'https://pay.kiwify.com.br/abc' })).toMatchObject({ ok: true });
    for (const bad of ['pay.kiwify.com.br', 'javascript:alert(1)', 'ftp://x.com', 'https://']) {
      const r = validateOffer({ ...valid, checkoutUrl: bad });
      expect(r.ok, bad).toBe(false);
    }
  });

  it('devolve um erro por campo', () => {
    const r = validateOffer({ name: ' ', code: 'a b', salesPlatform: 'Outra', price: '0', checkoutUrl: '' });
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Informe o nome da oferta.',
        code: 'Use de 2 a 12 letras ou números, sem espaços nem acentos.',
        salesPlatform: 'Escolha a plataforma de vendas.',
        price: 'Informe um preço válido, por exemplo 149,90.',
      },
    });
  });

  it('limites: código de 2 a 12, preço até R$ 100.000', () => {
    expect(validateOffer({ ...valid, code: 'A' }).ok).toBe(false);
    expect(validateOffer({ ...valid, code: 'ABCDEFGHIJKLM' }).ok).toBe(false);
    expect(validateOffer({ ...valid, price: '100.000,01' }).ok).toBe(false);
    expect(validateOffer({ ...valid, price: '100.000,00' }).ok).toBe(true);
    expect(validateOffer({ ...valid, name: 'x'.repeat(81) }).ok).toBe(false);
  });
});
