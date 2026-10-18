import type { SalesPlatform } from '@/lib/data/types';

export const SALES_PLATFORMS: SalesPlatform[] = ['Kiwify', 'Hotmart', 'Eduzz', 'Shopify'];

/** Converte "149,90", "1.499,90" ou "149.90" em centavos. `null` se não for um valor válido. */
export function parsePriceToCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/i, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;

  let normalized: string;
  if (text.includes(',')) {
    // Vírgula é o decimal; pontos são milhar.
    if (text.indexOf(',') !== text.lastIndexOf(',')) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    normalized = text; // "149.90"
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, ''); // "1.499"
  } else if (/^\d+$/.test(text)) {
    normalized = text;
  } else {
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export interface OfferInput {
  name: string;
  code: string;
  salesPlatform: SalesPlatform;
  priceCents: number;
  checkoutUrl: string | null;
}

export type OfferField = 'name' | 'code' | 'salesPlatform' | 'price' | 'checkoutUrl';
export type OfferValidation = { ok: true; value: OfferInput } | { ok: false; errors: Partial<Record<OfferField, string>> };

const MAX_PRICE_CENTS = 100_000_00; // R$ 100.000,00

export function validateOffer(raw: { name: string; code: string; salesPlatform: string; price: string; checkoutUrl: string }): OfferValidation {
  const errors: Partial<Record<OfferField, string>> = {};

  const name = raw.name.trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Informe o nome da oferta.';
  else if (name.length > 80) errors.name = 'O nome pode ter no máximo 80 caracteres.';

  const code = raw.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(code)) errors.code = 'Use de 2 a 12 letras ou números, sem espaços nem acentos.';

  const salesPlatform = SALES_PLATFORMS.find((p) => p === raw.salesPlatform);
  if (!salesPlatform) errors.salesPlatform = 'Escolha a plataforma de vendas.';

  const priceCents = parsePriceToCents(raw.price);
  if (priceCents === null || priceCents <= 0) errors.price = 'Informe um preço válido, por exemplo 149,90.';
  else if (priceCents > MAX_PRICE_CENTS) errors.price = 'O preço máximo é R$ 100.000,00.';

  let checkoutUrl: string | null = null;
  const url = raw.checkoutUrl.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocolo');
      checkoutUrl = parsed.toString();
    } catch {
      errors.checkoutUrl = 'Informe um link completo, começando com https://.';
    }
    if (url.length > 2000) errors.checkoutUrl = 'O link é longo demais.';
  }

  if (Object.keys(errors).length > 0 || !salesPlatform || priceCents === null) return { ok: false, errors };
  return { ok: true, value: { name, code, salesPlatform, priceCents, checkoutUrl } };
}

export const UTM_PATTERN =
  'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}';
export const CAMPAIGN_NAME_PATTERN = 'OFERTA_ESTRUTURA_PÚBLICO';
