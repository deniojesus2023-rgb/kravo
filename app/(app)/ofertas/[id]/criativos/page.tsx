import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CreativesGrid } from '@/components/offer/CreativesGrid';
import { OfferHeader } from '@/components/offer/OfferHeader';
import { NotesFooter, SourceNote } from '@/components/ui/Notes';
import { EmptyPeriod, UnderConstruction } from '@/components/ui/PageStates';
import { PeriodSelector } from '@/components/ui/PeriodSelector';
import { loadCreatives } from '@/lib/creatives/read';
import { getContext, getMetaConnection, getOffer, getOfferDetail, parsePeriod } from '@/lib/data';
import { CREATIVE_PARAMS } from '@/lib/rules';
import { formatBRL } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offer = await getOffer((await params).id);
  return { title: offer ? `Criativos · ${offer.name}` : 'Oferta não encontrada' };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodo?: string }> }) {
  const { id } = await params;
  const period = parsePeriod((await searchParams).periodo);
  const offer = await getOffer(id);
  if (!offer) notFound();
  const [context, connection, detail] = await Promise.all([getContext(), getMetaConnection(), getOfferDetail(id, period)]);
  const header = <OfferHeader offer={offer} current="/criativos" isSample={context.isSample} actions={<PeriodSelector current={period} />} />;

  // Os criativos vêm dos anúncios lidos do Meta; os dados de exemplo não têm esse nível.
  const supabase = context.isSample ? null : await createClient();
  if (!supabase) return <>{header}<UnderConstruction title="Criativos" /></>;
  if (!detail) return <>{header}<EmptyPeriod coverage={context.coverage} /></>;

  const { rows, unattributedSales } = await loadCreatives(supabase, id, detail.period, detail.salesConnected);

  return (
    <>
      {header}
      {rows.length === 0 ? (
        <section className="card flex flex-col gap-2 p-6" aria-labelledby="sem-criativos">
          <h2 id="sem-criativos" className="m-0 text-base font-semibold">Nenhum anúncio com gasto neste período</h2>
          <p className="m-0 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
            Os anúncios aparecem depois que o Meta Ads é lido para as campanhas ligadas a esta oferta. Nada foi estimado.
          </p>
        </section>
      ) : (
        <>
          <p className="m-0 text-[13px] text-fg-muted">
            {rows.length} {rows.length === 1 ? 'anúncio com gasto' : 'anúncios com gasto'} no período · Meta Ads{detail.salesConnected ? ` + ${offer.salesPlatform}` : ''}
          </p>
          {!detail.salesConnected && (
            <p role="status" className="m-0 rounded-lg border border-line-strong p-3 text-[13px] text-fg-muted">
              Sem plataforma de vendas ligada a esta oferta, ROAS real, CPA, vendas e etiquetas ficam indisponíveis. O ROAS do Meta não é usado como prova de lucro.
            </p>
          )}
          {detail.salesConnected && unattributedSales > 0 && (
            <p role="status" className="m-0 rounded-lg border border-line-strong p-3 text-[13px] text-fg-muted">
              {unattributedSales} {unattributedSales === 1 ? 'venda aprovada' : 'vendas aprovadas'} no período não {unattributedSales === 1 ? 'tem' : 'têm'} anúncio identificado (UTM ausente ou desconhecida) e não entram nos criativos.
            </p>
          )}
          <CreativesGrid rows={rows} salesConnected={detail.salesConnected} />
          <NotesFooter>
            <span>
              <span className="text-fg-muted">Critérios.</span> Destaque: maior ROAS entre criativos com ao menos {CREATIVE_PARAMS.highlightMinSales} vendas. Revisar: ROAS abaixo de {CREATIVE_PARAMS.reviewRoasBelow.toFixed(1).replace('.', ',')}x com gasto a partir de {formatBRL(CREATIVE_PARAMS.reviewMinSpendCents, { decimals: 0 })}. Dados insuficientes: gasto abaixo de {formatBRL(CREATIVE_PARAMS.reviewMinSpendCents, { decimals: 0 })} e menos de {CREATIVE_PARAMS.insufficientSalesBelow} vendas.
            </span>
            <span>
              <span className="text-fg-muted">Hook rate</span> = visualizações de 3 segundos ÷ impressões, só para vídeo. CTR = cliques no link ÷ impressões. Vendas e ROAS vêm dos pedidos aprovados ligados ao anúncio pela UTM.
            </span>
            <SourceNote context={context} sources={context.sources} period={detail.period} delayMinutes={connection.lastSync?.delayMinutes ?? null} />
          </NotesFooter>
        </>
      )}
    </>
  );
}
