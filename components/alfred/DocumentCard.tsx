import Link from 'next/link';
import { FileText } from 'lucide-react';
import { formatDateShort } from '@/lib/format';
import { INGEST_ERROR_TEXT } from '@/lib/alfred/errors';
import type { AlfredDocument } from '@/lib/alfred/types';
import { DocumentActions } from './DocumentActions';
import { DocumentProcessingStatus } from './DocumentProcessingStatus';

/** Texto do último erro, quando o código é conhecido. */
export const errorText = (code: string | null) => (code && code in INGEST_ERROR_TEXT ? INGEST_ERROR_TEXT[code as keyof typeof INGEST_ERROR_TEXT] : null);

export function DocumentCard({ doc, canManage = false }: { doc: AlfredDocument; canManage?: boolean }) {
  const error = doc.status === 'erro' || doc.status === 'processando' || doc.status === 'aguardando' ? errorText(doc.lastError) : null;
  return (
    <li className="rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <FileText size={20} aria-hidden="true" className="mt-0.5 flex-none text-fg-subtle" />
        <div className="flex min-w-0 flex-[2_1_220px] flex-col gap-1">
          <Link href={`/alfred/biblioteca/${doc.id}`} className="truncate text-[14.5px] font-medium hover:underline" title={doc.name}>{doc.name}</Link>
          <span className="text-[12.5px] text-fg-subtle">
            {doc.type}
            {doc.pages !== null && <> · <span className="num">{doc.pages}</span> páginas</>} · enviado em <span className="num">{formatDateShort(doc.uploadedAt)}</span>
          </span>
          {doc.chunks > 0 && <span className="text-[12.5px] text-fg-muted"><span className="num">{doc.chunks}</span> trechos na memória</span>}
          {error && <span className="text-[12.5px] text-loss">{error}</span>}
        </div>
        <div className="min-w-[170px] flex-[1_1_170px]"><DocumentProcessingStatus doc={doc} /></div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/alfred/biblioteca/${doc.id}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-hover">Abrir</Link>
          {canManage && <DocumentActions doc={doc} />}
        </div>
      </div>
    </li>
  );
}
