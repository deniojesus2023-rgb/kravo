import Link from 'next/link';
import { formatPeriodRange } from '@/lib/format';

/** Período sem dados de exemplo. Em produção viria da sincronização com Meta Ads e vendas. */
export function EmptyPeriod({ coverage }: { coverage: { start: string; end: string } }) {
  return (
    <section className="card flex flex-col items-start gap-3 p-6" aria-labelledby="sem-dados">
      <h2 id="sem-dados" className="m-0 text-base font-semibold">
        Sem dados de exemplo para este período
      </h2>
      <p className="m-0 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
        Os dados de exemplo cobrem apenas os 7 dias de {formatPeriodRange(coverage.start, coverage.end)}.
        Com a integração real, este período seria carregado do Meta Ads e da plataforma de vendas. Nenhum valor foi
        estimado.
      </p>
      <Link
        href="?periodo=7d"
        scroll={false}
        className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover"
      >
        Ver 7 dias
      </Link>
    </section>
  );
}

export function UnderConstruction({ title }: { title: string }) {
  return (
    <section className="card flex flex-col items-start gap-3 p-6" aria-labelledby="em-construcao">
      <h2 id="em-construcao" className="m-0 text-base font-semibold">
        {title}: em construção
      </h2>
      <p className="m-0 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
        Esta tela está desenhada, mas ainda não foi implementada. A Fase 1 cobre a Visão geral e o Dashboard da
        oferta.
      </p>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover"
      >
        Voltar para a Visão geral
      </Link>
    </section>
  );
}
