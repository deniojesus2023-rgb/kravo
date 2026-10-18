import type { Metadata } from 'next';
import Link from 'next/link';
import { OffersTable } from '@/components/overview/OffersTable';
import { Delta } from '@/components/ui/Delta';
import { EmptyPeriod } from '@/components/ui/PageStates';
import { PeriodSelector } from '@/components/ui/PeriodSelector';
import { DecisionCriteriaNote, NotesFooter, ProfitFormulaNote, SourceNote } from '@/components/ui/Notes';
import { SampleDataTag } from '@/components/ui/SampleDataTag';
import { formatBRL, formatRoas, formatUpdatedAt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getContext, getMetaConnection, getOverview, parsePeriod, type Alert } from '@/lib/data';

export const metadata: Metadata = { title: 'Visão geral' };

const SEVERITY: Record<Alert['severity'], { label: string; tone: string }> = {
  baixa: { label: 'Informação · gravidade baixa', tone: 'text-fg-muted' },
  media: { label: 'Atenção · gravidade média', tone: 'text-warn' },
  alta: { label: 'Crítico · gravidade alta', tone: 'text-loss' },
};

function Kpi({ label, value, valueClass, children }: { label: string; value: string; valueClass?: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-2.5 px-5 py-[18px]">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <span className={cn('num text-[30px] font-medium tracking-[-0.02em]', valueClass)}>{value}</span>
      <span className="text-[12.5px] text-fg-muted">{children}</span>
    </div>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const period = parsePeriod((await searchParams).periodo);
  const [context, overview, connection] = await Promise.all([getContext(), getOverview(period), getMetaConnection()]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Visão geral</h1>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
            <span>
              {overview ? `${overview.offers.length} ofertas em teste · ` : ''}atualizado{' '}
              {formatUpdatedAt(context.now, context.now)}
            </span>
            {context.isSample && <SampleDataTag />}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodSelector current={period} />
          <Link
            href="/ofertas/nova"
            className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover"
          >
            + Nova oferta
          </Link>
        </div>
      </div>

      {!overview ? (
        <EmptyPeriod coverage={context.coverage} />
      ) : (
        <>
          <section aria-label="Indicadores do portfólio" className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
            <Kpi label="Gasto" value={formatBRL(overview.totals.spendCents)}>
              <Delta value={overview.deltas.spend} polarity="neutral" /> vs. 7 dias anteriores
            </Kpi>
            <Kpi label="Faturamento" value={formatBRL(overview.totals.approvedRevenueCents)}>
              <Delta value={overview.deltas.revenue} polarity="higher-is-better" /> vs. 7 dias anteriores
            </Kpi>
            <Kpi
              label="Lucro líquido"
              value={formatBRL(overview.totals.netProfitCents)}
              valueClass={overview.totals.netProfitCents < 0 ? 'text-loss' : 'text-fg'}
            >
              <Delta value={overview.deltas.profit} polarity="higher-is-better" /> vs. 7 dias anteriores
            </Kpi>
            <Kpi label="ROAS real" value={formatRoas(overview.totals.roasReal)}>
              <Delta value={overview.deltas.roas} polarity="higher-is-better" /> vs. 7 dias anteriores
            </Kpi>
          </section>

          {overview.alerts.length > 0 && (
            <section aria-label="Alertas" className="flex flex-col gap-3">
              {overview.alerts.map((alert) => {
                const severity = SEVERITY[alert.severity];
                return (
                  <article key={alert.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2.5 px-[18px] py-3.5">
                    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', severity.tone)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M12 4l9 16H3z" />
                        <path d="M12 10v4M12 17v.01" />
                      </svg>
                      {severity.label}
                    </span>
                    <span className="min-w-[min(100%,320px)] flex-1 text-[13.5px]">
                      {alert.reason} {alert.recommendedAction}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {alert.source} · atualizado {formatUpdatedAt(alert.updatedAt, context.now)}
                    </span>
                    <Link href={`/ofertas/${alert.offerId}`} className="text-[13px] underline underline-offset-2">
                      Ver oferta
                    </Link>
                  </article>
                );
              })}
            </section>
          )}

          <OffersTable
            offers={overview.offers}
            footer={
              <NotesFooter>
                <DecisionCriteriaNote />
                <ProfitFormulaNote />
                <SourceNote
                  context={context}
                  sources={context.sources}
                  period={overview.period}
                  delayMinutes={connection.lastSync.delayMinutes}
                />
              </NotesFooter>
            }
          />
        </>
      )}
    </>
  );
}
