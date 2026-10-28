import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { Concept } from '@/lib/alfred/types';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-5">
      <h2 className="m-0 text-[11.5px] font-medium tracking-[0.14em] text-fg-subtle uppercase">{title}</h2>
      {children}
    </section>
  );
}
const List = ({ items }: { items: string[] }) => <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[14.5px] leading-relaxed marker:text-fg-subtle">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;

/** Registro completo. Só mostra as seções que o documento de origem trouxe; nenhuma é preenchida por inferência. */
export function ConceptDetail({ concept: c }: { concept: Concept }) {
  return (
    <article className="flex flex-col gap-5">
      <Link href="/alfred/conhecimento" className="inline-flex w-fit items-center gap-1 text-[13px] text-fg-muted hover:text-fg"><ChevronLeft size={15} aria-hidden="true" />Base de conhecimento</Link>
      <header className="flex flex-col gap-2">
        <span className="w-fit rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-fg-muted">{c.category}</span>
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">{c.name}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-fg-muted">{c.summary}</p>
      </header>
      {c.definition && <Section title="Definição"><p className="m-0 text-[14.5px] leading-[1.7]">{c.definition}</p></Section>}
      {c.howItWorks && <Section title="Funcionamento"><p className="m-0 text-[14.5px] leading-[1.7]">{c.howItWorks}</p></Section>}
      {c.applications && c.applications.length > 0 && <Section title="Aplicações"><List items={c.applications} /></Section>}
      {c.examples && c.examples.length > 0 && <Section title="Exemplos"><List items={c.examples} /></Section>}
      {c.limitations && c.limitations.length > 0 && <Section title="Limitações"><List items={c.limitations} /></Section>}
      {c.references && c.references.length > 0 && (
        <Section title="Referências">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
            {c.references.map((r, i) => (
              <li key={`${r.documentId}-${r.page ?? i}`}>
                <Link href={`/alfred/biblioteca/${r.documentId}`} className="text-fg underline underline-offset-2 hover:text-fg-muted">{r.documentName}</Link>
                {r.page !== null && <span className="num text-fg-subtle"> · página {r.page}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {c.related && c.related.length > 0 && (
        <Section title="Conceitos relacionados">
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {c.related.map((r) => <li key={r.id}><Link href={`/alfred/conhecimento/${r.id}`} className="inline-flex h-9 items-center rounded-full border border-line px-3.5 text-[13px] hover:border-line-strong">{r.name}</Link></li>)}
          </ul>
        </Section>
      )}
      <p className="m-0 border-t border-line pt-4 text-[12.5px] text-fg-subtle">Origem: <span className="text-fg-muted">{c.sourceDocument}</span> · <span className="num">{c.sourceCount}</span> {c.sourceCount === 1 ? 'fonte' : 'fontes'}</p>
    </article>
  );
}
