'use client';

import { useState } from 'react';

/** Campo só de leitura com botão Copiar. Seleciona o texto se o navegador não deixar copiar. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<'sim' | 'falhou' | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('sim');
    } catch {
      setCopied('falhou');
    }
    setTimeout(() => setCopied(null), 3000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="kiwify-url" className="text-[13px] text-fg-muted">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="kiwify-url"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="num h-10 min-w-0 flex-[1_1_260px] rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-fg"
        />
        <button type="button" onClick={copy} className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
          Copiar
        </button>
      </div>
      <span role="status" className="min-h-4 text-xs text-fg-muted">
        {copied === 'sim' ? 'URL copiada.' : copied === 'falhou' ? 'Não foi possível copiar. Toque no campo e copie o texto selecionado.' : ''}
      </span>
    </div>
  );
}
