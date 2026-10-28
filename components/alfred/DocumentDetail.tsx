import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { formatDateShort } from '@/lib/format';
import type { AlfredDocument } from '@/lib/alfred/types';
import { DocumentProcessingStatus } from './DocumentProcessingStatus';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <span className="text-[12px] text-fg-subtle">{label}</span>
      <span className={`num text-[24px] font-medium ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

/** Detalhe do documento. Todos os números são do processamento real; nada é estimado. */
export function DocumentDetail({ doc }: { doc: AlfredDocument }) {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/alfred/biblioteca" className="inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-fg"><ChevronLeft size={15} aria-hidden="true" />Biblioteca</Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] break-words">{doc.name}</h1>
        <p className="m-0 text-[13.5px] text-fg-muted">
          {doc.type} · {doc.category ?? 'Sem categoria'} · enviado em <span className="num">{formatDateShort(doc.uploadedAt)}</span>
        </p>
        <div className="max-w-[320px]"><DocumentProcessingStatus doc={doc} /></div>
      </header>
      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Páginas no documento" value={doc.pages} />
        <Stat label="Páginas processadas" value={doc.processedPages} />
        <Stat label="Páginas com falha" value={doc.failedPages} tone={doc.failedPages > 0 ? 'text-loss' : undefined} />
        <Stat label="Conceitos extraídos" value={doc.concepts} />
        <Stat label="Referências" value={doc.references} />
      </dl>
      {doc.concepts > 0 && (
        <Link href="/alfred/conhecimento" className="inline-flex h-10 w-fit items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">Ver conceitos na base de conhecimento</Link>
      )}
    </div>
  );
}
