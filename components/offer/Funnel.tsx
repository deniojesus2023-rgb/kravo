import { formatBRL, formatInt, formatPercent } from '@/lib/format';
import {
  checkoutToPurchaseRate,
  clickToViewRate,
  cpcCents,
  cpmCents,
  ctr,
  pageToPurchaseRate,
  viewToCheckoutRate,
  type FunnelTotals,
} from '@/lib/rules';
import { cn } from '@/lib/cn';

const dash = '—';
const pct = (v: number | null, decimals = 1) => (v === null ? dash : formatPercent(v, decimals));
const brl = (v: number | null) => (v === null ? dash : formatBRL(v, { decimals: 2 }));

/** Larguras do desenho: indicam a ordem das etapas, não são proporcionais aos valores. */
const BAR_WIDTHS = ['100%', '74%', '58%', '32%', '18%'];

export function Funnel({ totals }: { totals: FunnelTotals }) {
  const steps = [
    { label: 'Impressões', value: totals.impressions, note: `CPM ${brl(cpmCents(totals))}` },
    { label: 'Cliques no link', value: totals.linkClicks, note: `CTR ${pct(ctr(totals), 2)} · CPC ${brl(cpcCents(totals))}` },
    { label: 'Visualizações da página', value: totals.landingPageViews, note: `${pct(clickToViewRate(totals))} dos cliques` },
    { label: 'Checkout iniciado', value: totals.checkouts, note: `${pct(viewToCheckoutRate(totals))} das visualizações` },
    { label: 'Compras', value: totals.purchases, note: `${pct(checkoutToPurchaseRate(totals))} dos checkouts` },
  ];

  return (
    <section className="card flex min-w-0 flex-col gap-[18px] p-5" aria-labelledby="funil">
      <h2 id="funil" className="m-0 text-base font-semibold">
        Funil
      </h2>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {steps.map((step, i) => (
          <li key={step.label} className="flex flex-col gap-[7px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px]">{step.label}</span>
              <span className="num text-[15px] font-medium">{formatInt(step.value)}</span>
            </div>
            <div
              aria-hidden="true"
              className={cn('h-1.5 rounded-[3px]', i === steps.length - 1 ? 'bg-fg' : 'bg-line-strong')}
              style={{ width: BAR_WIDTHS[i] }}
            />
            <span className="text-xs text-fg-subtle">{step.note}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto border-t border-line pt-3.5 text-[12.5px] text-fg-muted">
        Conversão da página até a compra: <span className="num text-fg">{pct(pageToPurchaseRate(totals), 2)}</span>
        <span className="mt-1 block text-xs text-fg-subtle">Compras = pedidos aprovados na plataforma de vendas.</span>
      </div>
    </section>
  );
}
