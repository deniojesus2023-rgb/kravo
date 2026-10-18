'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
