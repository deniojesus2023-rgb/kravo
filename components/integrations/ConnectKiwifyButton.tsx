'use client';

import { useFormStatus } from 'react-dom';

/** Botão de conectar com estado de espera: a conexão faz várias chamadas à Kiwify e leva alguns segundos. */
export function ConnectKiwifyButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Conectando… pode levar alguns segundos' : 'Conectar Kiwify'}
    </button>
  );
}
