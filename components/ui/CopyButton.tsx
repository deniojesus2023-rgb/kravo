'use client';

import { useState } from 'react';

/** Copia um texto e avisa a leitores de tela. Se o navegador bloquear a cópia, o texto continua selecionável. */
export function CopyButton({ text, label }: { text: string; label: string }) {
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
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label}`}
        className="inline-flex h-[30px] items-center rounded-lg border border-line-strong px-3 text-[12.5px] font-medium hover:bg-surface-hover"
      >
        {state === 'copied' ? 'Copiado' : state === 'failed' ? 'Não foi possível copiar' : 'Copiar'}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? `${label} copiado` : state === 'failed' ? 'Não foi possível copiar' : ''}
      </span>
    </>
  );
}
