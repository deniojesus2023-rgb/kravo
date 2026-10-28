import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/lib/cn';
import { inlineText, isAnalysisHeading, parseMarkdown, type Block, type Inline } from '@/lib/alfred/markdown';

function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'strong':
        return <strong key={i} className="font-semibold text-fg">{renderInline(n.children)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(n.children)}</em>;
      case 'code':
        return <code key={i} className="num rounded bg-surface-raised px-1.5 py-0.5 text-[0.9em]">{n.text}</code>;
      case 'link':
        return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline underline-offset-2 hover:text-brand-hover">{renderInline(n.children)}</a>;
    }
  });
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.type) {
    case 'heading': {
      const text = inlineText(b.children);
      // Seções analíticas (DIAGNÓSTICO, ANÁLISE…) viram rótulos de seção, não títulos grandes.
      if (isAnalysisHeading(text)) {
        return (
          <h3 key={i} className="mt-6 mb-0 border-b border-line pb-2 text-[12px] font-semibold tracking-[0.16em] text-brand uppercase first:mt-0">
            {renderInline(b.children)}
          </h3>
        );
      }
      const size = b.level === 1 ? 'text-[20px]' : b.level === 2 ? 'text-[17px]' : 'text-[15px]';
      return (
        <h3 key={i} className={cn('mt-5 mb-0 font-semibold tracking-[-0.01em] first:mt-0', size)}>
          {renderInline(b.children)}
        </h3>
      );
    }
    case 'paragraph':
      return <p key={i} className="m-0 leading-[1.7]">{renderInline(b.children)}</p>;
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <Tag key={i} className={cn('m-0 flex flex-col gap-1.5 pl-5 leading-[1.65]', b.ordered ? 'list-decimal' : 'list-disc', 'marker:text-fg-subtle')}>
          {b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </Tag>
      );
    }
    case 'quote':
      return <blockquote key={i} className="m-0 flex flex-col gap-2 border-l-2 border-brand/60 pl-4 text-fg-muted">{b.children.map(renderBlock)}</blockquote>;
    case 'code':
      return (
        <figure key={i} className="m-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
          <figcaption className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
            <span className="num text-[11.5px] text-fg-subtle">{b.lang || 'texto'}</span>
            <CopyButton text={b.text} label="código" />
          </figcaption>
          <pre className="num m-0 overflow-x-auto p-3 text-[12.5px] leading-relaxed"><code>{b.text}</code></pre>
        </figure>
      );
    case 'table':
      return (
        <div key={i} className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-surface-sunken text-fg-subtle">
              <tr>{b.header.map((h, j) => <th key={j} scope="col" style={{ textAlign: b.align[j] ?? undefined }} className="px-3 py-2 font-medium whitespace-nowrap">{renderInline(h)}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {b.header.map((_, c) => <td key={c} style={{ textAlign: b.align[c] ?? undefined }} className="px-3 py-2 align-top">{renderInline(row[c] ?? [])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'rule':
      return <hr key={i} className="m-0 border-0 border-t border-line" />;
  }
}

/** Renderiza Markdown como elementos React (nunca HTML bruto). */
export function Markdown({ source }: { source: string }) {
  return <div className="flex flex-col gap-3.5 text-[15px] text-fg">{parseMarkdown(source).map(renderBlock)}</div>;
}
