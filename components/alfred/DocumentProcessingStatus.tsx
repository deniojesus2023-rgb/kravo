import { AlertCircle, CheckCircle2, CircleDashed, Clock, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { AlfredDocument, DocumentStatus } from '@/lib/alfred/types';

export const STATUS_META: Record<DocumentStatus, { label: string; icon: LucideIcon; tone: string }> = {
  aguardando: { label: 'Aguardando', icon: Clock, tone: 'text-fg-muted' },
  processando: { label: 'Processando', icon: LoaderCircle, tone: 'text-fg' },
  concluido: { label: 'Concluído', icon: CheckCircle2, tone: 'text-profit' },
  parcial: { label: 'Parcial', icon: CircleDashed, tone: 'text-warn' },
  erro: { label: 'Erro', icon: AlertCircle, tone: 'text-loss' },
};

/** Estado do processamento, sempre com texto. O progresso vem das páginas realmente processadas, nunca de estimativa. */
export function DocumentProcessingStatus({ doc }: { doc: Pick<AlfredDocument, 'status' | 'pages' | 'processedPages' | 'failedPages' | 'emptyPages'> }) {
  const meta = STATUS_META[doc.status];
  const Icon = meta.icon;
  const pages = doc.pages ?? 0;
  // Páginas já lidas: com texto, sem texto ou com falha.
  const read = doc.processedPages + doc.failedPages + doc.emptyPages;
  const done = pages > 0 ? Math.min(100, Math.round((read / pages) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${meta.tone}`}>
        <Icon size={14} aria-hidden="true" className={doc.status === 'processando' ? 'animate-spin' : undefined} />
        {meta.label}
      </span>
      {(doc.status === 'processando' || doc.status === 'parcial') && pages > 0 && (
        <>
          <div role="progressbar" aria-label="Páginas processadas" aria-valuemin={0} aria-valuemax={pages} aria-valuenow={read} className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
            <div className="h-full rounded-full bg-fg-muted" style={{ width: `${done}%` }} />
          </div>
          <span className="num text-[11.5px] text-fg-subtle">
            {read} de {pages} páginas{doc.failedPages > 0 ? ` · ${doc.failedPages} com falha` : ''}
          </span>
        </>
      )}
    </div>
  );
}
