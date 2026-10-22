import type { Metadata } from 'next';
import Link from 'next/link';
import { NewOfferForm } from '@/components/offer/NewOfferForm';
import { NewOfferFromCampaigns, type KiwifyChoice, type PickableCampaign } from '@/components/offer/NewOfferFromCampaigns';
import { CopyButton } from '@/components/ui/CopyButton';
import { readKiwifyIntegration } from '@/lib/kiwify/read';
import { UTM_PATTERN } from '@/lib/offers/validate';
import { publicOrigin } from '@/lib/origin';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import { createOffer, createOfferFromCampaigns } from './actions';

export const metadata: Metadata = { title: 'Nova oferta' };

const code = 'num block rounded-lg border border-line bg-surface-sunken px-3.5 py-3 text-[12.5px] leading-relaxed break-all whitespace-pre-wrap';

export default async function NewOfferPage() {
  const supabase = isAuthConfigured() ? await createClient() : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  let campaigns: PickableCampaign[] = [];
  let totalCampaigns = 0;
  let metaAccounts = 0;
  let kiwify: KiwifyChoice = { connected: false, products: null };
  if (supabase && user) {
    const [camp, accounts] = await Promise.all([
      supabase.from('campaigns').select('id, name, status, daily_budget_cents, ad_account_id, offer_id').order('name').limit(1000),
      supabase.from('ad_accounts').select('id, name, selected'),
    ]);
    const names = new Map((accounts.data ?? []).map((a) => [a.id as string, a.name as string]));
    metaAccounts = (accounts.data ?? []).filter((a) => a.selected).length;
    totalCampaigns = (camp.data ?? []).length;
    campaigns = (camp.data ?? [])
      .filter((c) => !c.offer_id)
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        active: c.status === 'ativa',
        dailyBudgetCents: c.daily_budget_cents as number | null,
        accountName: names.get(c.ad_account_id as string) ?? null,
      }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    const k = await readKiwifyIntegration(supabase, createAdminClient(), user.id, await publicOrigin());
    kiwify = { connected: k.status === 'conectado', products: k.products };
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Link href="/" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Visão geral
        </Link>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Nova oferta</h1>
        <span className="text-[13px] text-fg-muted">Escolha as campanhas que estão no Meta, o gateway de vendas e ative. O rastreamento começa na ativação.</span>
      </div>

      <div className="flex max-w-[860px] flex-col gap-4">
        {!supabase || !user ? (
          <section className="card p-5 text-[13.5px] text-fg-muted" aria-label="Aviso">
            O cadastro de ofertas precisa da autenticação configurada. Defina as variáveis do Supabase para ativar.
          </section>
        ) : campaigns.length > 0 ? (
          <NewOfferFromCampaigns action={createOfferFromCampaigns} campaigns={campaigns} kiwify={kiwify} />
        ) : (
          <section className="card flex flex-col gap-3 p-5" aria-labelledby="sem-campanhas">
            <h2 id="sem-campanhas" className="m-0 text-base font-semibold">
              {totalCampaigns > 0 ? 'Todas as campanhas já estão em ofertas' : metaAccounts === 0 ? 'Conecte o Meta Ads primeiro' : 'Nenhuma campanha lida ainda'}
            </h2>
            <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
              {totalCampaigns > 0
                ? 'Quando você criar campanhas novas no Meta, sincronize em Integrações e elas aparecem aqui.'
                : metaAccounts === 0
                  ? 'Em Integrações, conecte o Facebook e marque as contas de anúncios que a trakfy pode ler.'
                  : 'Em Integrações, toque em "Sincronizar agora" para ler as campanhas das contas marcadas.'}
            </p>
            <div>
              <Link href="/integracoes" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
                Ir para Integrações
              </Link>
            </div>
          </section>
        )}

        {supabase && user && (
          <details className="card p-5">
            <summary className="cursor-pointer text-[13.5px] font-medium">Cadastrar sem escolher campanhas agora (manual)</summary>
            <div className="mt-4 flex flex-col gap-3">
              <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
                Cria a oferta vazia, com um código de sua escolha. As campanhas ficam sem ligação até você criar outra oferta a partir delas.
              </p>
              <NewOfferForm action={createOffer} />
            </div>
          </details>
        )}

        <section className="card flex flex-col gap-[18px] p-5" aria-labelledby="rastreamento">
          <div className="flex flex-col gap-1.5">
            <h2 id="rastreamento" className="m-0 text-base font-semibold">
              Rastreamento das vendas por anúncio
            </h2>
            <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
              Para a trakfy ligar cada pedido à campanha e ao anúncio que o gerou, use este padrão de UTM nos parâmetros de URL dos anúncios.
              Ele usa os códigos que o próprio Meta preenche, e não depende do nome das campanhas.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-fg-muted">Padrão de UTM dos anúncios</span>
              <CopyButton text={UTM_PATTERN} label="padrão de UTM" />
            </div>
            <code className={code}>{UTM_PATTERN}</code>
          </div>

          <div className="flex items-center gap-2.5 border-t border-line pt-4 text-[13px] text-fg-muted">
            <span aria-hidden="true" className="size-[7px] flex-none rounded-full border border-fg-subtle" />
            O rastreamento só é marcado como ativo depois de receber um evento real.
          </div>
        </section>
      </div>
    </>
  );
}
