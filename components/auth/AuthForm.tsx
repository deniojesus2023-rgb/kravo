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

const ICON = {
  email: <path d="M3 7l9 6 9-6M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  password: <path d="M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 10V7a4 4 0 0 1 8 0v3" />,
} as const;

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 inline-flex h-[50px] items-center justify-center gap-2.5 rounded-[10px] bg-brand px-4 text-[15px] font-semibold text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Aguarde…' : children}
      {!pending && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
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
    <form action={formAction} noValidate className="flex flex-col gap-[18px]">
      {next && <input type="hidden" name="next" value={next} />}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-${f.name}`} className="text-[13px] text-fg-muted">
            {f.label}
          </label>
          <div className="relative flex items-center">
          {f.type !== 'text' && (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 text-fg-muted"
            >
              {ICON[f.type]}
            </svg>
          )}
          <input
            id={`${id}-${f.name}`}
            name={f.name}
            type={f.type}
            autoComplete={f.autoComplete}
            required={f.required}
            aria-describedby={[f.hint ? `${id}-${f.name}-hint` : '', state?.error ? feedbackId : ''].filter(Boolean).join(' ') || undefined}
            aria-invalid={state?.error ? true : undefined}
            className={`h-12 w-full rounded-[10px] border border-line-strong bg-canvas pr-3.5 text-[15px] text-fg placeholder:text-fg-subtle focus-visible:border-brand ${f.type === 'text' ? 'pl-3.5' : 'pl-[42px]'}`}
          />
          </div>
          {f.hint && (
            <span id={`${id}-${f.name}-hint`} className="text-xs text-fg-subtle">
              {f.hint}
            </span>
          )}
        </div>
      ))}

      <div id={feedbackId} aria-live="polite" className="[&:empty]:-mt-[18px]">
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
