'use client';

import { useState, useTransition } from 'react';
import { setAdAccountSelected } from '@/app/(app)/integracoes/actions';
import type { MetaIntegration } from '@/lib/meta/read';

/** Escolha das contas de anúncios que a kavro pode ler. Salva a cada clique e mostra o erro, se houver. */
export function AdAccountList({ accounts }: { accounts: MetaIntegration['accounts'] }) {
  const [selected, setSelected] = useState(() => new Map(accounts.map((a) => [a.id, a.selected])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const count = [...selected.values()].filter(Boolean).length;

  function toggle(id: string, next: boolean) {
    setError(null);
    setSelected((m) => new Map(m).set(id, next));
    start(async () => {
      const result = await setAdAccountSelected(id, next);
      if (result.error) {
        setSelected((m) => new Map(m).set(id, !next));
        setError(result.error);
      }
    });
  }

  if (accounts.length === 0) {
    return <p className="m-0 text-[13px] text-fg-muted">Nenhuma conta de anúncios encontrada neste login do Facebook.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs text-fg-subtle" aria-live="polite">
        Escolha quais contas a kavro pode ler. {count} de {accounts.length} selecionadas.
      </span>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {accounts.map((a) => {
          const unsupported = a.currency !== 'BRL';
          return (
            <li key={a.id}>
              <label className="flex items-start gap-3 rounded-lg border border-line px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={selected.get(a.id) ?? false}
                  disabled={pending || (unsupported && !selected.get(a.id))}
                  onChange={(e) => toggle(a.id, e.target.checked)}
                  className="mt-1 size-4 accent-brand"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="num text-xs text-fg-subtle">
                    {a.metaAccountId}
                    {` · ${a.currency ?? 'moeda desconhecida'}`}
                  </span>
                  {!unsupported && a.timezoneName && a.timezoneName !== 'America/Sao_Paulo' && (
                    <span className="text-xs text-warn">
                      Fuso da conta: {a.timezoneName}. Os dias seguem o fuso da conta, que difere de America/Sao_Paulo.
                    </span>
                  )}
                  {unsupported && (
                    <span className="text-xs text-warn">Moeda diferente de BRL: a kavro ainda não lê esta conta.</span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
