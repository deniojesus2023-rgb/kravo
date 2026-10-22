'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { getMetaEnv } from '@/lib/meta/config';
import { createGraph } from '@/lib/meta/graph';
import { runMetaSync } from '@/lib/meta/run';
import { supabaseRunDb } from '@/lib/meta/sync-store';
import { generateOfferCode, validateFromCampaigns, type FromCampaignsField } from '@/lib/offers/from-campaigns';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { validateOffer, type OfferField } from '@/lib/offers/validate';

export type CreateOfferState =
  | {
      errors?: Partial<Record<OfferField, string>>;
      error?: string;
      values?: Record<string, string>;
    }
  | undefined;

const text = (data: FormData, key: string) => String(data.get(key) ?? '');

export async function createOffer(_: CreateOfferState, data: FormData): Promise<CreateOfferState> {
  const values = {
    name: text(data, 'name'),
    code: text(data, 'code'),
    salesPlatform: text(data, 'salesPlatform'),
    price: text(data, 'price'),
    checkoutUrl: text(data, 'checkoutUrl'),
  };

  const result = validateOffer(values);
  if (!result.ok) return { errors: result.errors, values };

  const supabase = await createClient();
  if (!supabase) return { error: 'O cadastro precisa da autenticação configurada neste ambiente.', values };

  // user_id assume o usuário autenticado (default auth.uid()); a RLS impede qualquer outro valor.
  const { data: created, error } = await supabase
    .from('offers')
    .insert({
      name: result.value.name,
      code: result.value.code,
      sales_platform: result.value.salesPlatform,
      price_cents: result.value.priceCents,
      checkout_url: result.value.checkoutUrl,
      status: 'em_teste',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { errors: { code: 'Já existe uma oferta com este código.' }, values };
    return { error: 'Não foi possível salvar a oferta agora. Tente de novo em instantes.', values };
  }

  revalidatePath('/', 'layout');
  redirect(`/ofertas/${created.id}`);
}

export type FromCampaignsState =
  | {
      errors?: Partial<Record<FromCampaignsField, string>>;
      error?: string;
      values?: { name: string; price: string; salesPlatform: string; productId: string; campaignIds: string[] };
    }
  | undefined;

/**
 * Nova oferta a partir das campanhas do Meta escolhidas pelo usuário: cria a oferta, liga as campanhas e o produto
 * da plataforma de vendas e dispara a leitura das métricas. Nada é ligado por nome de campanha.
 */
export async function createOfferFromCampaigns(_: FromCampaignsState, data: FormData): Promise<FromCampaignsState> {
  const values = {
    name: text(data, 'name'),
    price: text(data, 'price'),
    salesPlatform: text(data, 'salesPlatform'),
    productId: text(data, 'productId'),
    campaignIds: data.getAll('campaign').map(String),
  };
  const result = validateFromCampaigns(values);
  if (!result.ok) return { errors: result.errors, values };

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return { error: 'Entre na sua conta para continuar.', values };
  const { campaignIds, name, salesPlatform, priceCents, productId } = result.value;

  // As campanhas precisam ser do usuário (RLS) e estar livres: uma campanha pertence a uma oferta só.
  const found = await supabase.from('campaigns').select('id, offer_id, ad_account_id').in('id', campaignIds);
  if (found.error || (found.data ?? []).length !== campaignIds.length) return { errors: { campaigns: 'Campanha não encontrada. Recarregue a página.' }, values };
  if (found.data!.some((c) => c.offer_id)) return { errors: { campaigns: 'Alguma campanha já pertence a outra oferta. Recarregue a página.' }, values };
  const accounts = new Set(found.data!.map((c) => c.ad_account_id as string));

  // Código interno único por usuário; repete com outro se colidir.
  let offerId: string | null = null;
  for (let attempt = 0; attempt < 5 && !offerId; attempt += 1) {
    const { data: created, error } = await supabase
      .from('offers')
      .insert({
        name,
        code: generateOfferCode(),
        sales_platform: salesPlatform,
        price_cents: priceCents,
        status: 'em_teste',
        sales_product_id: productId,
        ad_account_id: accounts.size === 1 ? [...accounts][0] : null,
      })
      .select('id')
      .single();
    if (!error) offerId = created.id as string;
    else if (error.code === '23505' && productId && /offers_user_platform_product/.test(error.message)) {
      return { errors: { product: 'Este produto já está ligado a outra oferta.' }, values };
    } else if (error.code !== '23505') return { error: 'Não foi possível salvar a oferta agora. Tente de novo em instantes.', values };
  }
  if (!offerId) return { error: 'Não foi possível gerar o código da oferta. Tente de novo.', values };

  const linked = await supabase.from('campaigns').update({ offer_id: offerId }).in('id', campaignIds).is('offer_id', null).select('id');
  if (linked.error || (linked.data ?? []).length !== campaignIds.length) {
    await supabase.from('campaigns').update({ offer_id: null }).eq('offer_id', offerId);
    await supabase.from('offers').delete().eq('id', offerId);
    return { error: 'Não foi possível ligar as campanhas. Nada foi criado; tente de novo.', values };
  }

  // Começa a traquear: lê as métricas do Meta agora, sem esperar o agendador.
  const env = getMetaEnv();
  const admin = createAdminClient();
  if (env && admin) after(() => runMetaSync({ userId: user.id, graph: createGraph(env), db: supabaseRunDb(admin) }).catch(() => undefined));

  revalidatePath('/', 'layout');
  redirect(`/ofertas/${offerId}`);
}
