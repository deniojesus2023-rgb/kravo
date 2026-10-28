import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { formatDateShort } from '@/lib/format';
import type { AlfredDocument } from '@/lib/alfred/types';
import { errorText } from './DocumentCard';
import { DocumentProcessingStatus } from './DocumentProcessingStatus';

function Stat({ label, value, tone }: { label: string; value: number | null; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <dt className="text-[12px] text-fg-subtle">{label}</dt>
      <dd className={`num m-0 text-[24px] font-medium ${tone ?? ''}`}>{value ?? '—'}</dd>
    </div>
  );
}

/** Detalhe do documento. Todos os números são do processamento real; nada é estimado. */
export function DocumentDetail({ doc }: { doc: AlfredDocument }) {
  const error = errorText(doc.lastError);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/alfred/biblioteca" className="inline-flex w-fit items-center gap-1 text-[13px] text-fg-muted hover:text-fg"><ChevronLeft size={15} aria-hidden="true" />Biblioteca</Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em] break-words">{doc.name}</h1>
        <p className="m-0 text-[13.5px] text-fg-muted">
          {doc.type} · {doc.category ?? 'Sem categoria'} · enviado em <span className="num">{formatDateShort(doc.uploadedAt)}</span>
        </p>
        <div className="max-w-[320px]"><DocumentProcessingStatus doc={doc} /></div>
        {error && <p role="note" className="m-0 max-w-[60ch] text-[13px] text-loss">{error}</p>}
      </header>
      <dl className="m-0 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Páginas no documento" value={doc.pages} />
        <Stat label="Páginas lidas com texto" value={doc.processedPages} />
        <Stat label="Páginas sem texto" value={doc.emptyPages} />
        <Stat label="Páginas com falha" value={doc.failedPages} tone={doc.failedPages > 0 ? 'text-loss' : undefined} />
        <Stat label="Trechos na memória" value={doc.chunks} />
      </dl>
      {doc.failedPageList.length > 0 && (
        <p className="m-0 max-w-[70ch] text-[13px] leading-relaxed text-fg-muted">
          Páginas que não puderam ser lidas: <span className="num">{doc.failedPageList.join(', ')}</span>. Use “Ler de novo” na Biblioteca para tentar outra vez.
        </p>
      )}
      {doc.emptyPages > 0 && doc.chunks > 0 && (
        <p className="m-0 max-w-[70ch] text-[13px] leading-relaxed text-fg-subtle">Páginas sem texto costumam ser capas, imagens ou páginas em branco. Se elas tinham conteúdo, o PDF é escaneado nessas partes e o conteúdo não entrou na memória (ainda não há leitura de imagem).</p>
      )}
    </div>
  );
}
