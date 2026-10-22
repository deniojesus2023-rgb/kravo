/** Nova oferta a partir das campanhas do Meta que o usuário escolhe. Funções puras (testáveis). */

import { SALES_PLATFORMS, parsePriceToCents } from './validate';
import type { SalesPlatform } from '@/lib/data/types';

export interface FromCampaignsInput {
  campaignIds: string[];
  name: string;
  salesPlatform: SalesPlatform;
  /** Opcional: sem preço, a oferta nasce com 0 e o ticket vem das vendas. */
  priceCents: number;
  /** Produto da plataforma de vendas; `null` = ligar depois. */
  productId: string | null;
}

export type FromCampaignsField = 'campaigns' | 'name' | 'salesPlatform' | 'price' | 'product';
export type FromCampaignsResult = { ok: true; value: FromCampaignsInput } | { ok: false; errors: Partial<Record<FromCampaignsField, string>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CAMPAIGNS = 200;

export function validateFromCampaigns(raw: { campaignIds: string[]; name: string; salesPlatform: string; price: string; productId: string }): FromCampaignsResult {
  const errors: Partial<Record<FromCampaignsField, string>> = {};

  const campaignIds = [...new Set(raw.campaignIds.map((id) => id.trim()))];
  if (campaignIds.length === 0) errors.campaigns = 'Escolha ao menos uma campanha.';
  else if (campaignIds.length > MAX_CAMPAIGNS || campaignIds.some((id) => !UUID.test(id))) errors.campaigns = 'Campanha inválida. Recarregue a página e escolha de novo.';

  const name = raw.name.trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Informe o nome da oferta.';
  else if (name.length > 80) errors.name = 'O nome pode ter no máximo 80 caracteres.';

  const salesPlatform = SALES_PLATFORMS.find((p) => p === raw.salesPlatform);
  if (!salesPlatform) errors.salesPlatform = 'Escolha a plataforma de vendas.';

  let priceCents = 0;
  if (raw.price.trim()) {
    const parsed = parsePriceToCents(raw.price);
    if (parsed === null || parsed > 100_000_00) errors.price = 'Informe um preço válido, por exemplo 29,90, ou deixe em branco.';
    else priceCents = parsed;
  }

  const productId = raw.productId.trim();
  if (productId && !/^[A-Za-z0-9_-]{6,64}$/.test(productId)) errors.product = 'Produto inválido.';

  if (Object.keys(errors).length > 0 || !salesPlatform) return { ok: false, errors };
  return { ok: true, value: { campaignIds, name, salesPlatform, priceCents, productId: productId || null } };
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Código interno da oferta (offers.code, único por usuário). Não tem relação com o nome das campanhas. */
export function generateOfferCode(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  return `O${Array.from({ length: 7 }, () => ALPHABET[random(ALPHABET.length)]).join('')}`;
}
