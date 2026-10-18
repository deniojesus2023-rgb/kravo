import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionBadge } from '@/components/ui/ActionBadge';
import { SampleDataTag } from '@/components/ui/SampleDataTag';
import { formatBRL } from '@/lib/format';
import type { OfferAction } from '@/lib/rules';
import { cn } from '@/lib/cn';
import type { Offer } from '@/lib/data';

const TABS = [
  { slug: '', label: 'Resumo' },
  { slug: '/criativos', label: 'Criativos' },
  { slug: '/rastreamento', label: 'Rastreamento' },
];

function trackingText({ pixel, conversionsApi }: Offer['tracking']): string {
  if (pixel && conversionsApi) return 'Pixel e API de Conversões ativos';
  if (pixel) return 'Pixel ativo, API de Conversões inativa';
  if (conversionsApi) return 'API de Conversões ativa, Pixel inativo';
  return 'Pixel e API de Conversões inativos';
}

export function OfferHeader({
  offer,
  action,
  current,
  isSample,
  actions,
}: {
  offer: Offer;
  action?: OfferAction;
  current: '' | '/criativos' | '/rastreamento';
  isSample: boolean;
  /** Controles à direita, como o seletor de período. */
  actions?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Link href="/" className="w-fit text-[13px] text-fg-muted hover:text-fg">
            ← Visão geral
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">{offer.name}</h1>
            {action && <ActionBadge action={action} />}
          </div>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
            <span>
              {offer.salesPlatform} · {formatBRL(offer.priceCents, { decimals: 2 })} ·{' '}
              {offer.adAccountName ? `${offer.adAccountName} · ` : 'Sem conta de anúncios · '}
              {trackingText(offer.tracking)}
            </span>
            {isSample && <SampleDataTag />}
          </span>
        </div>
        {actions}
      </div>

      <nav aria-label="Seções da oferta" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((tab) => {
          const active = tab.slug === current;
          return (
            <Link
              key={tab.slug}
              href={`/ofertas/${offer.id}${tab.slug}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                '-mb-px border-b-2 px-3.5 py-2.5 text-[13.5px] whitespace-nowrap',
                active ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
