import { FileText } from 'lucide-react';
import type { ChatMessageData } from '@/lib/alfred/types';
import { AlfredMark } from './AlfredMark';
import { CopyMessage } from './CopyMessage';
import { Markdown } from './Markdown';

/** Mensagem do usuário: discreta, à direita. Resposta do Alfred: largura de leitura, Markdown, fontes e copiar. */
export function ChatMessage({ message }: { message: ChatMessageData }) {
  if (message.role === 'user') {
    return (
      <article aria-label="Sua mensagem" className="flex justify-end">
        <p className="m-0 max-w-[85%] rounded-2xl bg-surface-raised px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
      </article>
    );
  }
  return (
    <article aria-label="Resposta do Alfred" className="flex gap-3.5">
      <AlfredMark size={24} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Markdown source={message.content} />
        {message.sources && message.sources.length > 0 && (
          <footer className="flex flex-col gap-1.5 border-t border-line pt-3">
            <span className="text-[11px] font-medium tracking-[0.12em] text-fg-subtle uppercase">Fontes</span>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {message.sources.map((s, i) => (
                <li key={`${s.documentId}-${s.page ?? i}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-fg-muted">
                  <FileText size={12} aria-hidden="true" />
                  <span className="max-w-[28ch] truncate">{s.documentName}</span>
                  {s.page !== null && <span className="num text-fg-subtle">p. {s.page}</span>}
                </li>
              ))}
            </ul>
          </footer>
        )}
        <div><CopyMessage text={message.content} /></div>
      </div>
    </article>
  );
}

/** Indicador enquanto o Alfred gera a resposta. */
export function ThinkingIndicator() {
  return (
    <div role="status" className="flex items-center gap-3.5 text-[13.5px] text-fg-muted">
      <AlfredMark size={24} />
      <span>Alfred está analisando…</span>
    </div>
  );
}
