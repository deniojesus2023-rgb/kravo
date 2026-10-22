'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import type { CreateOfferState } from '@/app/(app)/ofertas/nova/actions';
import { SALES_PLATFORMS } from '@/lib/offers/validate';

const input =
  'h-10 w-full rounded-lg border border-line-strong bg-surface-sunken px-3 text-[14px] text-fg placeholder:text-fg-subtle';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Criando…' : 'Criar oferta'}
    </button>
  );
}

export function NewOfferForm({
  action,
}: {
  action: (state: CreateOfferState, data: FormData) => Promise<CreateOfferState>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const id = useId();
  const v = state?.values ?? {};
  const err = state?.errors ?? {};

  const field = (name: string, label: string, hint?: string) => {
    const error = err[name as keyof typeof err];
    return {
      label: (
        <label htmlFor={`${id}-${name}`} className="text-[13px] text-fg-muted">
          {label}
        </label>
      ),
      props: {
        id: `${id}-${name}`,
        name,
        'aria-invalid': error ? (true as const) : undefined,
        'aria-describedby': [hint ? `${id}-${name}-hint` : '', error ? `${id}-${name}-err` : ''].filter(Boolean).join(' ') || undefined,
      },
      note: (
        <>
          {hint && (
            <span id={`${id}-${name}-hint`} className="text-xs text-fg-subtle">
              {hint}
            </span>
          )}
          {error && (
            <span id={`${id}-${name}-err`} className="text-xs text-loss">
              {error}
            </span>
          )}
        </>
      ),
    };
  };

  const name = field('name', 'Nome da oferta');
  const code = field('code', 'Código da oferta', 'Identificador interno, de 2 a 12 letras ou números. Ex.: VASOS.');
  const platform = field('salesPlatform', 'Plataforma de vendas');
  const price = field('price', 'Preço (BRL)');
  const checkout = field('checkoutUrl', 'Link do checkout (opcional)');

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <section className="card flex flex-col gap-4 p-5" aria-labelledby={`${id}-dados`}>
        <h2 id={`${id}-dados`} className="m-0 text-base font-semibold">
          1. Dados da oferta
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <div className="flex flex-col gap-1.5">
            {name.label}
            <input {...name.props} type="text" autoComplete="off" required defaultValue={v.name} className={input} />
            {name.note}
          </div>
          <div className="flex flex-col gap-1.5">
            {code.label}
            <input {...code.props} type="text" autoComplete="off" required defaultValue={v.code} className={`${input} num uppercase`} />
            {code.note}
          </div>
          <div className="flex flex-col gap-1.5">
            {platform.label}
            <select {...platform.props} required defaultValue={v.salesPlatform ?? 'Kiwify'} className={input}>
              {SALES_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {platform.note}
          </div>
          <div className="flex flex-col gap-1.5">
            {price.label}
            <input {...price.props} type="text" inputMode="decimal" autoComplete="off" required defaultValue={v.price} placeholder="149,90" className={`${input} num`} />
            {price.note}
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            {checkout.label}
            <input {...checkout.props} type="url" autoComplete="off" defaultValue={v.checkoutUrl} placeholder="https://[LINK DO CHECKOUT]" className={input} />
            {checkout.note}
          </div>
        </div>
      </section>

      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="m-0 rounded-lg border border-loss/40 px-3 py-2 text-[13px] text-loss">
            {state.error}
          </p>
        )}
      </div>

      <div>
        <Submit />
      </div>
    </form>
  );
}
