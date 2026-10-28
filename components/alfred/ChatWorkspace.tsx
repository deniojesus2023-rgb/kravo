'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessageData } from '@/lib/alfred/types';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage, ThinkingIndicator } from './ChatMessage';
import { ErrorState } from './states';

const NOT_CONNECTED = 'O Alfred ainda não está conectado a um modelo de IA, então o envio está desativado. Você já pode montar a mensagem; ela não é enviada nem salva.';

/**
 * Área do chat. `onSend` é a ligação com o backend de conversação: devolve a resposta do Alfred em Markdown.
 * Sem `onSend`, o campo de mensagem funciona (sugestões preenchem o texto), mas enviar fica desativado.
 */
export function ChatWorkspace({ initialMessages = [], onSend }: { initialMessages?: ChatMessageData[]; onSend?: (text: string, history: ChatMessageData[]) => Promise<string> }) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  async function submit() {
    if (!onSend) return;
    const text = draft.trim();
    if (!text) return;
    const user: ChatMessageData = { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() };
    const history = [...messages, user];
    setMessages(history);
    setDraft('');
    setError(null);
    setPending(true);
    try {
      const answer = await onSend(text, history);
      setMessages([...history, { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: new Date().toISOString() }]);
    } catch {
      setError('Não foi possível obter a resposta do Alfred agora. Sua mensagem foi mantida acima; tente enviar de novo.');
    } finally {
      setPending(false);
    }
  }

  const empty = messages.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <ChatEmptyState onPick={(prompt) => (setDraft(prompt), requestAnimationFrame(() => document.getElementById('mensagem')?.focus()))} />
        ) : (
          <div role="log" aria-live="polite" aria-label="Conversa" className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 py-8 sm:px-6">
            {messages.map((m) => <ChatMessage key={m.id} message={m} />)}
            {pending && <ThinkingIndicator />}
            {error && <ErrorState title="A resposta falhou" description={error} />}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="flex-none border-t border-line-faint bg-canvas px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          <ChatComposer value={draft} onChange={setDraft} onSubmit={submit} pending={pending} canSend={Boolean(onSend)} disabledReason={onSend ? undefined : NOT_CONNECTED} />
        </div>
      </div>
    </div>
  );
}
