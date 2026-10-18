import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CampaignsPanel } from '@/components/offer/CampaignsPanel';
import { DecisionReason } from '@/components/offer/DecisionReason';
import { Funnel } from '@/components/offer/Funnel';
import { OfferHeader } from '@/components/offer/OfferHeader';
import { OfferKpis } from '@/components/offer/OfferKpis';
import { SpendRevenueChart } from '@/components/offer/SpendRevenueChart';
import { NotesFooter, ProfitFormulaNote, SourceNote } from '@/components/ui/Notes';
import { EmptyPeriod } from '@/components/ui/PageStates';
import { PeriodSelector } from '@/components/ui/PeriodSelector';
import { getContext, getMetaConnection, getOffer, getOfferDetail, parsePeriod } from '@/lib/data';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offer = await getOffer((await params).id);
  return { title: offer?.name ?? 'Oferta não encontrada' };
}

export default async function OfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { id } = await params;
  const period = parsePeriod((await searchParams).periodo);
  const offer = await getOffer(id);
  if (!offer) notFound();

  const [context, connection, detail] = await Promise.all([getContext(), getMetaConnection(), getOfferDetail(id, period)]);
  const hasActivity =
    detail !== null &&
    (detail.sales > 0 || detail.campaigns.length > 0 || detail.daily.some((d) => d.spendCents > 0 || d.impressions > 0));

  return (
    <>
      <OfferHeader
        offer={offer}
        action={detail?.decision.action}
        current=""
        isSample={context.isSample}
        actions={<PeriodSelector current={period} />}
      />

      {!detail ? (
        <EmptyPeriod coverage={context.coverage} />
      ) : (
        <>
          <DecisionReason
            decision={detail.decision}
            period={detail.period}
            source={`Meta Ads + ${offer.salesPlatform}`}
          />

          <OfferKpis summary={detail} />

          {!hasActivity ? (
            <section className="card overflow-hidden" aria-labelledby="sem-movimento">
              <div className="flex flex-col items-start gap-2 p-6">
                <h2 id="sem-movimento" className="m-0 text-base font-semibold">
                  Nenhum dado neste período
                </h2>
                <p className="m-0 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
                  Ainda não há gasto, pedidos nem campanhas ligadas a esta oferta. Os números aparecem quando o Meta Ads e
                  a plataforma de vendas estiverem conectados. Nada foi estimado.
                </p>
              </div>
              <NotesFooter>
                <ProfitFormulaNote />
                <SourceNote
                  context={context}
                  sources={context.sources}
                  period={detail.period}
                  delayMinutes={connection.lastSync?.delayMinutes ?? null}
                />
              </NotesFooter>
            </section>
          ) : (
            <>
              <div className="flex flex-wrap items-stretch gap-4">
                <section className="card box-border flex min-w-0 flex-[3_1_480px] flex-col gap-4 p-5" aria-labelledby="grafico">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="grafico" className="m-0 text-base font-semibold">
                      Gasto x receita por dia
                    </h2>
                    <div className="flex gap-4 text-[12.5px] text-fg-muted">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-0.5 w-3.5 bg-fg" />
                        Receita aprovada
                      </span>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-0.5 w-3.5 bg-fg-subtle" />
                        Gasto
                      </span>
                    </div>
                  </div>
                  <SpendRevenueChart
                    days={detail.daily.map((d) => ({ date: d.date, spendCents: d.spendCents, revenueCents: d.approvedRevenueCents }))}
                  />
                </section>

                <div className="flex min-w-0 flex-[2_1_320px] flex-col">
                  <Funnel totals={{ adSpendCents: detail.spendCents, ...detail.funnel }} />
                </div>
              </div>

              <CampaignsPanel
                campaigns={detail.campaigns}
                adsetCount={detail.adsetCount}
                adCount={detail.adCount}
                footer={
                  <NotesFooter>
                    <ProfitFormulaNote />
                    <SourceNote
                      context={context}
                      sources={context.isSample ? ['Meta Ads', offer.salesPlatform] : context.sources}
                      period={detail.period}
                      delayMinutes={connection.lastSync?.delayMinutes ?? null}
                    />
                  </NotesFooter>
                }
              />
            </>
          )}
        </>
      )}
    </>
  );
}
