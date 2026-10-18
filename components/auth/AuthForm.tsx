'use client';

import { useActionState, useId, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { AuthFormState } from '@/app/(auth)/actions';

type Field = {
  name: string;
  label: string;
  type: 'email' | 'password' | 'text';
  autoComplete: string;
  required?: boolean;
  hint?: string;
};

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Aguarde…' : children}
    </button>
  );
}

/** Formulário de autenticação com erro e confirmação anunciados a leitores de tela. */
export function AuthForm({
  action,
  fields,
  submitLabel,
  next,
}: {
  action: (state: AuthFormState, data: FormData) => Promise<AuthFormState>;
  fields: Field[];
  submitLabel: string;
  next?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const id = useId();
  const feedbackId = `${id}-feedback`;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${f.name}`} className="text-[13px] text-fg-muted">
            {f.label}
          </label>
          <input
            id={`${id}-${f.name}`}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            required={f.required}
            aria-describedby={[f.hint ? `${id}-${f.name}-hint` : '', state?.error ? feedbackId : ''].filter(Boolean).join(' ') || undefined}
            aria-invalid={state?.error ? true : undefined}
            className="h-10 rounded-lg border border-line-strong bg-surface-sunken px-3 text-[14px] text-fg placeholder:text-fg-subtle"
          />
          {f.hint && (
            <span id={`${id}-${f.name}-hint`} className="text-xs text-fg-subtle">
              {f.hint}
            </span>
          )}
        </div>
      ))}

      <div id={feedbackId} aria-live="polite">
        {state?.error && (
          <p role="alert" className="m-0 rounded-lg border border-loss/40 px-3 py-2 text-[13px] text-loss">
            {state.error}
          </p>
        )}
        {state?.message && (
          <p role="status" className="m-0 rounded-lg border border-line-strong px-3 py-2 text-[13px] text-fg">
            {state.message}
          </p>
        )}
      </div>

      <Submit>{submitLabel}</Submit>
    </form>
  );
}
