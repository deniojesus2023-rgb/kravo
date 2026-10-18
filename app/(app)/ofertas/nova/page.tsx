import type { Metadata } from 'next';
import Link from 'next/link';
import { NewOfferForm } from '@/components/offer/NewOfferForm';
import { CopyButton } from '@/components/ui/CopyButton';
import { CAMPAIGN_NAME_PATTERN, UTM_PATTERN } from '@/lib/offers/validate';
import { isAuthConfigured } from '@/lib/supabase/env';
import { createOffer } from './actions';

export const metadata: Metadata = { title: 'Nova oferta' };

const code = 'num block rounded-lg border border-line bg-surface-sunken px-3.5 py-3 text-[12.5px] leading-relaxed break-all whitespace-pre-wrap';

export default function NewOfferPage() {
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Link href="/" className="w-fit text-[13px] text-fg-muted hover:text-fg">
          ← Visão geral
        </Link>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Nova oferta</h1>
        <span className="text-[13px] text-fg-muted">
          Cadastre a oferta, depois ligue as contas e instale o rastreamento. As métricas aparecem quando as integrações
          estiverem conectadas.
        </span>
      </div>

      <div className="flex max-w-[860px] flex-col gap-4">
        {isAuthConfigured() ? (
          <NewOfferForm action={createOffer} />
        ) : (
          <section className="card p-5 text-[13.5px] text-fg-muted" aria-label="Aviso">
            O cadastro de ofertas precisa da autenticação configurada. Defina as variáveis do Supabase para ativar.
          </section>
        )}

        <section className="card flex flex-col gap-3 p-5" aria-labelledby="contas">
          <h2 id="contas" className="m-0 text-base font-semibold">
            2. Contas conectadas
          </h2>
          <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
            A conta de anúncios do Meta e o pixel serão escolhidos aqui quando a conexão com o Meta Ads estiver pronta.
            Até lá, a oferta fica sem conta de anúncios e sem métricas.
          </p>
        </section>

        <section className="card flex flex-col gap-[18px] p-5" aria-labelledby="rastreamento">
          <div className="flex flex-col gap-1.5">
            <h2 id="rastreamento" className="m-0 text-base font-semibold">
              3. Rastreamento
            </h2>
            <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
              Use o padrão de UTM nos anúncios e o padrão de nome nas campanhas, para a kavro ligar cada pedido ao anúncio
              que o gerou. O script da página de vendas e a API de Conversões ainda não estão disponíveis.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-fg-muted">Padrão de UTM dos anúncios</span>
              <CopyButton text={UTM_PATTERN} label="padrão de UTM" />
            </div>
            <code className={code}>{UTM_PATTERN}</code>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-fg-muted">Padrão de nome das campanhas</span>
            <code className={code}>{CAMPAIGN_NAME_PATTERN} · ex.: VASOS_CBO_ESCALA</code>
          </div>

          <div className="flex items-center gap-2.5 border-t border-line pt-4 text-[13px] text-fg-muted">
            <span aria-hidden="true" className="size-[7px] flex-none rounded-full border border-fg-subtle" />
            Aguardando o primeiro evento. O rastreamento só é marcado como ativo depois de receber um evento real.
          </div>
        </section>
      </div>
    </>
  );
}
