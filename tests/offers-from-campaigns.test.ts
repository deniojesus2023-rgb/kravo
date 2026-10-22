import { describe, expect, it } from 'vitest';
import { generateOfferCode, validateFromCampaigns } from '@/lib/offers/from-campaigns';
import { UTM_PATTERN } from '@/lib/offers/validate';

const ID = '0d5c8e4a-1b2f-4c3d-9e8f-123456789abc';
const ID2 = '1e6d9f5b-2c3a-4d4e-8f9a-23456789abcd';
const ok = { campaignIds: [ID], name: 'Vasos', salesPlatform: 'Kiwify', price: '', productId: '' };

describe('validateFromCampaigns', () => {
  it('aceita campanhas, nome e plataforma; preço e produto são opcionais', () => {
    expect(validateFromCampaigns(ok)).toEqual({ ok: true, value: { campaignIds: [ID], name: 'Vasos', salesPlatform: 'Kiwify', priceCents: 0, productId: null } });
    expect(validateFromCampaigns({ ...ok, price: '29,90', productId: 'prod-vasos' })).toMatchObject({ ok: true, value: { priceCents: 2990, productId: 'prod-vasos' } });
  });

  it('exige ao menos uma campanha válida, sem repetir', () => {
    expect(validateFromCampaigns({ ...ok, campaignIds: [] })).toMatchObject({ ok: false, errors: { campaigns: expect.stringContaining('ao menos uma') } });
    expect(validateFromCampaigns({ ...ok, campaignIds: ['1; drop table campaigns'] })).toMatchObject({ ok: false, errors: { campaigns: expect.stringContaining('inválida') } });
    expect(validateFromCampaigns({ ...ok, campaignIds: [ID, ID, ID2] })).toMatchObject({ ok: true, value: { campaignIds: [ID, ID2] } });
  });

  it('nome obrigatório (até 80), plataforma da lista, preço e produto bem formados', () => {
    expect(validateFromCampaigns({ ...ok, name: '   ' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(validateFromCampaigns({ ...ok, name: 'x'.repeat(81) })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(validateFromCampaigns({ ...ok, salesPlatform: 'Outra' })).toMatchObject({ ok: false, errors: { salesPlatform: expect.any(String) } });
    expect(validateFromCampaigns({ ...ok, price: 'abc' })).toMatchObject({ ok: false, errors: { price: expect.any(String) } });
    expect(validateFromCampaigns({ ...ok, productId: 'a b' })).toMatchObject({ ok: false, errors: { product: expect.any(String) } });
  });
});

describe('generateOfferCode', () => {
  it('código interno válido para o banco (2 a 12 letras e números), sem relação com o nome', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOfferCode()).toMatch(/^[A-Z0-9]{2,12}$/);
    expect(generateOfferCode(() => 0)).toBe('O0000000');
    expect(generateOfferCode(() => 35)).toBe('OZZZZZZZ');
  });
});

describe('padrão de UTM', () => {
  it('leva nome e ID do Meta (o ID é o que liga o pedido à campanha e ao anúncio)', () => {
    expect(UTM_PATTERN).toContain('{{campaign.name}}|{{campaign.id}}');
    expect(UTM_PATTERN).toContain('{{ad.name}}|{{ad.id}}');
    expect(UTM_PATTERN).toContain('{{adset.name}}|{{adset.id}}');
  });
});
