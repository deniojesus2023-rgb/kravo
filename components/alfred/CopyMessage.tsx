'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copia a resposta inteira (em Markdown). Avisa leitores de tela; se o navegador bloquear, diz isso. */
export function CopyMessage({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  }
  return (
    <>
      <button type="button" onClick={copy} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-subtle hover:bg-surface-hover hover:text-fg">
        {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Não foi possível copiar' : 'Copiar resposta'}
      </button>
      <span role="status" className="sr-only">{state === 'copied' ? 'Resposta copiada' : ''}</span>
    </>
  );
}
