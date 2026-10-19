import { formatAge, formatBRL, formatPercent, formatPeriodRange } from '@/lib/format';
import { DEFAULT_DECISION_PARAMS, FEES_NOT_REGISTERED_NOTICE, NET_PROFIT_FORMULA } from '@/lib/rules';
import type { DataContext } from '@/lib/data';

/** "Meta Ads + Hotmart, Kiwify e Eduzz" */
export function joinSources(sources: string[]): string {
  const [first, ...rest] = sources;
  if (!first) return '';
  if (rest.length === 0) return first;
  const tail = rest.length === 1 ? rest[0]! : `${rest.slice(0, -1).join(', ')} e ${rest[rest.length - 1]}`;
  return `${first} + ${tail}`;
}

const label = 'text-fg-muted';

export function ProfitFormulaNote() {
  return (
    <span>
      <span className={label}>Lucro líquido</span> = receita − reembolsos − gasto em mídia. {FEES_NOT_REGISTERED_NOTICE}
    </span>
  );
}

export function DecisionCriteriaNote() {
  const p = DEFAULT_DECISION_PARAMS;
  const x = (n: number) => String(n).replace('.', ',');
  return (
    <span>
      <span className={label}>Critérios.</span> Escalar: ROAS real ≥ {x(p.scaleMinRoas)}x, ao menos {p.scaleMinSales} vendas
      e reembolso ≤ {formatPercent(p.scaleMaxRefundRate, 0)}. Manter: os demais casos, por exemplo ROAS entre 1,0x e{' '}
      {x(p.scaleMinRoas)}x. Pausar: prejuízo com gasto ≥ {formatBRL(p.pauseMinSpendCents)} ou ao menos {p.pauseMinSales}{' '}
      vendas. Dados insuficientes: menos de {p.minSales} vendas no período. Limites iniciais, configuráveis.
    </span>
  );
}

/** Fonte, período, moeda, fuso, janela de atribuição e atraso: sempre perto dos números. */
export function SourceNote({
  context,
  sources,
  period,
  delayMinutes,
}: {
  context: DataContext;
  sources: string[];
  period: { start: string; end: string };
  delayMinutes: number | null;
}) {
  return (
    <span>
      <span className={label}>Fonte.</span>
      {context.isSample && ' Dados de exemplo, não são dados reais.'}{' '}
      {sources.length > 0
        ? joinSources(sources)
        : 'Nenhuma integração conectada ainda; os números virão do Meta Ads e das plataformas de venda.'}{' '}
      · {formatPeriodRange(period.start, period.end)} · {context.currency} · {context.timezone} · janela de atribuição:{' '}
      {context.attributionWindow} · atraso de sincronização: {delayMinutes === null ? 'sem sincronização ainda' : formatAge(delayMinutes)}.
    </span>
  );
}

export function NotesFooter({ children }: { children: React.ReactNode }) {
  return (
    <footer className="flex flex-col gap-1 border-t border-line px-5 py-3.5 text-xs leading-relaxed text-fg-subtle">
      {children}
    </footer>
  );
}
