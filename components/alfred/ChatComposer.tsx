'use client';

import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, LoaderCircle, Paperclip } from 'lucide-react';

const MAX_HEIGHT = 200;

/**
 * Campo de mensagem. Enter envia, Shift+Enter quebra linha (e Enter durante composição de IME não envia).
 * Enviar e anexar só funcionam quando `canSend` / `canAttach` forem verdadeiros: sem integração, ficam
 * desabilitados e o motivo aparece na tela.
 */
export function ChatComposer({ value, onChange, onSubmit, pending, canSend, canAttach = false, disabledReason }: { value: string; onChange: (v: string) => void; onSubmit: () => void; pending: boolean; canSend: boolean; canAttach?: boolean; disabledReason?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();

  // Altura acompanha o conteúdo, até um teto.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const ready = canSend && !pending && value.trim().length > 0;

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (ready) onSubmit();
    }
  }

  return (
    <form onSubmit={(e) => (e.preventDefault(), ready && onSubmit())} className="flex flex-col gap-2">
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2 focus-within:border-brand">
        <button type="button" disabled={!canAttach} aria-label="Anexar arquivo" title={canAttach ? 'Anexar arquivo' : 'Anexos ainda não estão disponíveis'} className="inline-flex size-11 flex-none items-center justify-center rounded-xl text-fg-muted hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
          <Paperclip size={19} aria-hidden="true" />
        </button>
        <label htmlFor="mensagem" className="sr-only">Mensagem para o Alfred</label>
        <textarea
          id="mensagem"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={disabledReason ? noteId : undefined}
          placeholder="Descreva sua ideia, apresente uma estratégia ou envie dados para análise…"
          className="max-h-[200px] min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
        />
        <button type="submit" disabled={!ready} aria-label={pending ? 'Gerando resposta' : 'Enviar mensagem'} className="inline-flex size-11 flex-none items-center justify-center rounded-xl bg-brand text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-fg-subtle">
          {pending ? <LoaderCircle size={19} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}
        </button>
      </div>
      {disabledReason ? (
        <p id={noteId} className="m-0 px-2 text-[12.5px] leading-relaxed text-fg-subtle">{disabledReason}</p>
      ) : (
        <p className="m-0 px-2 text-[12px] text-fg-subtle">Enter envia · Shift + Enter quebra a linha</p>
      )}
    </form>
  );
}
