import type { ReactNode } from 'react';
import { hasLegalPlaceholders, LEGAL } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
        <span className="text-[13px] text-fg-muted">Última atualização: {LEGAL.atualizadoEm}</span>
      </header>
      {hasLegalPlaceholders() && (
        <p role="note" className="m-0 rounded-lg border border-warn/40 px-3 py-2 text-[13px] text-warn">
          Rascunho: os dados do responsável ainda não foram preenchidos (lib/legal.ts). Revise este texto com um
          profissional jurídico antes de publicá-lo.
        </p>
      )}
      <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-fg-muted">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 text-base font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

export const P = ({ children }: { children: ReactNode }) => <p className="m-0">{children}</p>;

export function UL({ children }: { children: ReactNode }) {
  return <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}
