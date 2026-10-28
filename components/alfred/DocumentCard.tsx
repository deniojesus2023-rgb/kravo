import Link from 'next/link';
import { FileText } from 'lucide-react';
import { formatDateShort } from '@/lib/format';
import type { AlfredDocument } from '@/lib/alfred/types';
import { DocumentProcessingStatus } from './DocumentProcessingStatus';

export function DocumentCard({ doc }: { doc: AlfredDocument }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <FileText size={20} aria-hidden="true" className="mt-0.5 flex-none text-fg-subtle" />
        <div className="flex min-w-0 flex-[2_1_220px] flex-col gap-1">
          <Link href={`/alfred/biblioteca/${doc.id}`} className="truncate text-[14.5px] font-medium hover:text-brand" title={doc.name}>{doc.name}</Link>
          <span className="text-[12.5px] text-fg-subtle">
            {doc.type} · <span className="num">{doc.pages}</span> páginas · enviado em <span className="num">{formatDateShort(doc.uploadedAt)}</span>
          </span>
          <span className="text-[12.5px] text-fg-muted">{doc.category ?? 'Sem categoria'}</span>
        </div>
        <div className="min-w-[170px] flex-[1_1_170px]"><DocumentProcessingStatus doc={doc} /></div>
        <Link href={`/alfred/biblioteca/${doc.id}`} className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-hover">Abrir</Link>
      </div>
    </li>
  );
}
