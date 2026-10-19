'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatBRL, formatInt, formatPercent, formatRoas } from '@/lib/format';
import { cpaCents, roas } from '@/lib/rules';
import { cn } from '@/lib/cn';
import type { CampaignMetrics } from '@/lib/data';

type TabId = 'campanhas' | 'conjuntos' | 'anuncios';

const roasTone = (v: number | null) => (v === null ? '' : v >= 2.5 ? 'text-profit' : v < 1.5 ? 'text-loss' : '');

const thBase = 'h-10 px-4 text-xs font-normal whitespace-nowrap text-fg-subtle first:pl-5 last:pr-5';
const thR = `${thBase} text-right`;
const thL = `${thBase} text-left`;
const td = 'num px-4 text-right text-[13.5px] whitespace-nowrap first:pl-5 last:pr-5';

export function CampaignsPanel({
  campaigns,
  adsetCount,
  adCount,
  salesConnected = true,
  footer,
}: {
  campaigns: CampaignMetrics[];
  adsetCount: number;
  adCount: number;
  /** Falso: vendas, CPA e ROAS real por campanha são desconhecidos (sem plataforma de vendas). */
  salesConnected?: boolean;
  footer: ReactNode;
}) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'campanhas', label: `Campanhas · ${campaigns.length}` },
    { id: 'conjuntos', label: `Conjuntos · ${adsetCount}` },
    { id: 'anuncios', label: `Anúncios · ${adCount}` },
  ];
  const [active, setActive] = useState<TabId>('campanhas');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const next =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next]!;
    setActive(tab.id);
    refs.current[tab.id]?.focus();
  };

  const sum = (pick: (c: CampaignMetrics) => number) => campaigns.reduce((acc, c) => acc + pick(c), 0);
  const spend = sum((c) => c.spendCents);
  const sales = sum((c) => c.approvedOrders);
  const revenue = sum((c) => c.approvedRevenueCents);
  const clicks = sum((c) => c.linkClicks);
  const impressions = sum((c) => c.impressions);
  const totalRoas = roas(revenue, spend);

  return (
    <section className="card overflow-hidden" aria-label="Estrutura de campanhas">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div role="tablist" aria-label="Nível da estrutura" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-sunken p-[3px]">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              id={`tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={active === tab.id}
              aria-controls={`painel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'h-[30px] rounded-md px-3 text-[13px] whitespace-nowrap',
                active === tab.id ? 'bg-line text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-fg-muted">Padrão de nome: OFERTA_ESTRUTURA_PÚBLICO</span>
      </div>

      <div id="painel-campanhas" role="tabpanel" aria-labelledby="tab-campanhas" hidden={active !== 'campanhas'}>
        <div role="region" aria-label="Tabela de campanhas, role para os lados em telas estreitas" tabIndex={0} className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <caption className="sr-only">Campanhas da oferta com status, orçamento, gasto, vendas, CPA, ROAS real e CTR.</caption>
            <thead>
              <tr className="border-t border-line">
                <th scope="col" className={cn(thL, 'w-[24%]')}>Campanha</th>
                <th scope="col" className={thL}>Status</th>
                <th scope="col" className={thR}>Orçamento</th>
                <th scope="col" className={thR}>Gasto</th>
                <th scope="col" className={thR}>Vendas</th>
                <th scope="col" className={thR}>CPA</th>
                <th scope="col" className={thR}>ROAS real</th>
                <th scope="col" className={thR}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const cRoas = roas(c.approvedRevenueCents, c.spendCents);
                const cCpa = cpaCents(c.spendCents, c.approvedOrders);
                return (
                  <tr key={c.id} className="h-[52px] border-t border-line-faint hover:bg-surface-hover">
                    <th scope="row" className="num px-5 text-left text-[13px] font-medium">{c.name}</th>
                    <td className="px-4 text-left text-[13px] text-fg-muted">
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={cn('size-[7px] rounded-full', c.status === 'ativa' ? 'bg-profit' : 'bg-state-neutral')} />
                        {c.status === 'ativa' ? 'Ativa' : 'Pausada'}
                      </span>
                    </td>
                    <td className={cn(td, 'text-fg-muted')}>{formatBRL(c.dailyBudgetCents)}/dia</td>
                    <td className={td}>{formatBRL(c.spendCents)}</td>
                    <td className={td}>{salesConnected ? formatInt(c.approvedOrders) : '—'}</td>
                    <td className={td}>{salesConnected && cCpa !== null ? formatBRL(cCpa, { decimals: 2 }) : '—'}</td>
                    <td className={cn(td, salesConnected && roasTone(cRoas))}>{salesConnected ? formatRoas(cRoas) : '—'}</td>
                    <td className={cn(td, 'text-fg-muted')}>{c.impressions > 0 ? formatPercent(c.linkClicks / c.impressions) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="h-[52px] border-t border-line bg-surface-sunken text-[13.5px] font-medium">
                <th scope="row" className="px-5 text-left font-medium">Total</th>
                <td />
                <td className={cn(td, 'text-fg-muted')}>{formatBRL(sum((c) => c.dailyBudgetCents))}/dia</td>
                <td className={td}>{formatBRL(spend)}</td>
                <td className={td}>{salesConnected ? formatInt(sales) : '—'}</td>
                <td className={td}>{salesConnected && cpaCents(spend, sales) !== null ? formatBRL(cpaCents(spend, sales)!, { decimals: 2 }) : '—'}</td>
                <td className={cn(td, salesConnected && roasTone(totalRoas))}>{salesConnected ? formatRoas(totalRoas) : '—'}</td>
                <td className={cn(td, 'text-fg-muted')}>{impressions > 0 ? formatPercent(clicks / impressions, 2) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {(['conjuntos', 'anuncios'] as const).map((id) => (
        <div key={id} id={`painel-${id}`} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={active !== id} className="border-t border-line px-5 py-8">
          <p className="m-0 text-[13.5px] font-medium">Disponível na Fase 2</p>
          <p className="mt-1.5 mb-0 max-w-[60ch] text-[13px] leading-relaxed text-fg-muted">
            {id === 'conjuntos' ? 'Conjuntos de anúncios' : 'Anúncios'} serão lidos do Meta Ads na integração real. Na Fase 1 só as
            campanhas têm dados de exemplo.
          </p>
        </div>
      ))}

      {footer}
    </section>
  );
}
