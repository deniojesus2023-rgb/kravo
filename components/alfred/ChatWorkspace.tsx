'use client';

import { useEffect, useRef, useState } from 'react';
import { ERROR_TEXT, type SendResult } from '@/lib/alfred/errors';
import type { ChatMessageData } from '@/lib/alfred/types';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage, ThinkingIndicator } from './ChatMessage';
import { AlertTriangle } from 'lucide-react';

/**
 * Área do chat. `onSend` é a ligação com o backend (uma server action): recebe a conversa atual (ou `null` para
 * começar uma) e o texto, e devolve um resultado tipado. Sem `onSend`, o campo funciona (sugestões preenchem o
 * texto), mas enviar fica desativado e `disabledReason` explica por quê.
 */
export function ChatWorkspace({ conversationId: initialId = null, initialMessages = [], onSend, disabledReason }: { conversationId?: string | null; initialMessages?: ChatMessageData[]; onSend?: (conversationId: string | null, text: string) => Promise<SendResult>; disabledReason?: string }) {
  const [conversationId, setConversationId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, pending]);

  async function submit() {
    if (!onSend || pending) return;
    const text = draft.trim();
    if (!text) return;
    const optimistic: ChatMessageData = { id: `pendente-${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() };
    const before = messages;
    setMessages([...before, optimistic]);
    setDraft('');
    setError(null);
    setPending(true);
    try {
      const result = await onSend(conversationId, text);
      if (result.ok) {
        setMessages([...before, result.userMessage, result.assistantMessage]);
        if (result.conversationId !== conversationId) {
          setConversationId(result.conversationId);
          // Passa a conversa para o endereço dela, sem recarregar a tela.
          window.history.replaceState(null, '', `/alfred/c/${result.conversationId}`);
        }
      } else {
        // Nada foi gravado nem contado: a mensagem volta para o campo, para tentar de novo.
        setMessages(before);
        setDraft(text);
        setError(`${ERROR_TEXT[result.error] ?? ERROR_TEXT.indisponivel}${result.detail ? ` (detalhe técnico: ${result.detail})` : ''}`);
      }
    } catch {
      setMessages(before);
      setDraft(text);
      setError(ERROR_TEXT.indisponivel);
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
          <div role="log" aria-live="polite" aria-label="Conversa" className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-8 sm:px-6">
            {messages.map((m) => <ChatMessage key={m.id} message={m} />)}
            {pending && <ThinkingIndicator />}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="flex-none bg-canvas px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
          {error && (
            <p role="alert" className="m-0 flex items-start gap-2.5 rounded-lg border border-loss/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg-muted">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 flex-none text-loss" />
              <span>
                <strong className="font-medium text-fg">Não foi possível enviar.</strong> {error}
              </span>
            </p>
          )}
          <ChatComposer value={draft} onChange={setDraft} onSubmit={submit} pending={pending} canSend={Boolean(onSend)} disabledReason={onSend ? undefined : disabledReason} />
        </div>
      </div>
    </div>
  );
}
