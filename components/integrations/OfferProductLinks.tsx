'use client';

import { useId, useState, useTransition } from 'react';
import { linkOfferProduct } from '@/app/(app)/integracoes/actions';
import type { KiwifyIntegration } from '@/lib/kiwify/read';

/** Escolha do produto da Kiwify de cada oferta. Salva a cada mudança e mostra o erro, se houver. */
export function OfferProductLinks({ offers, products }: { offers: KiwifyIntegration['offers']; products: NonNullable<KiwifyIntegration['products']> }) {
  const base = useId();
  const [values, setValues] = useState(() => new Map(offers.map((o) => [o.id, o.productId ?? ''])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function change(id: string, next: string) {
    const prev = values.get(id) ?? '';
    setErrors((e) => ({ ...e, [id]: '' }));
    setValues((m) => new Map(m).set(id, next));
    start(async () => {
      const result = await linkOfferProduct(id, next);
      if (result.error) {
        setValues((m) => new Map(m).set(id, prev));
        setErrors((e) => ({ ...e, [id]: result.error! }));
      }
    });
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {offers.map((o) => {
        const selectId = `${base}-${o.id}`;
        return (
          <li key={o.id} className="flex flex-col gap-1.5 rounded-lg border border-line px-3.5 py-3">
            <label htmlFor={selectId} className="text-sm font-medium">
              {o.name} <span className="num text-xs font-normal text-fg-subtle">{o.code}</span>
            </label>
            <select
              id={selectId}
              value={values.get(o.id) ?? ''}
              disabled={pending}
              onChange={(e) => change(o.id, e.target.value)}
              className="h-10 rounded-lg border border-line-strong bg-canvas px-3 text-[13.5px] text-fg"
            >
              <option value="">Nenhum produto ligado</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors[o.id] && (
              <span role="alert" className="text-xs text-loss">
                {errors[o.id]}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
