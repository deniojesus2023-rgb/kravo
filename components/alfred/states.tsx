'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Estado vazio: diz o que falta e, quando for o caso, por que o recurso ainda não está ativo. Nunca mostra dado fictício. */
export function EmptyState({ icon, title, description, note, action }: { icon?: ReactNode; title: string; description: string; note?: string; action?: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-14 text-center" aria-labelledby="estado-vazio">
      {icon && <span className="text-fg-subtle">{icon}</span>}
      <h2 id="estado-vazio" className="m-0 text-[16px] font-semibold">
        {title}
      </h2>
      <p className="m-0 max-w-[52ch] text-[13.5px] leading-relaxed text-fg-muted">{description}</p>
      {note && <p className="m-0 max-w-[52ch] text-[12.5px] leading-relaxed text-fg-subtle">{note}</p>}
      {action}
    </section>
  );
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 px-6 py-16 text-[13.5px] text-fg-muted">
      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ title = 'Não foi possível carregar', description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-loss/40 px-6 py-12 text-center">
      <AlertTriangle size={22} className="text-loss" aria-hidden="true" />
      <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
      <p className="m-0 max-w-[52ch] text-[13.5px] leading-relaxed text-fg-muted">{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
          Tentar de novo
        </button>
      )}
    </section>
  );
}

/** Confirmação antes de ação destrutiva. <dialog> nativo: foco preso, Esc cancela. */
export function ConfirmDialog({ open, title, description, confirmLabel, pending = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel: string; pending?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby="confirmar-titulo" onCancel={(e) => (e.preventDefault(), onCancel())} onClick={(e) => e.target === e.currentTarget && onCancel()} className={cn('m-auto w-[min(420px,92vw)] rounded-xl border border-line bg-surface p-0 text-fg backdrop:bg-canvas/70')}>
      <div className="flex flex-col gap-4 p-6">
        <h2 id="confirmar-titulo" className="m-0 text-[16px] font-semibold">
          {title}
        </h2>
        <p className="m-0 text-[13.5px] leading-relaxed text-fg-muted">{description}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className="inline-flex h-10 items-center rounded-lg bg-loss px-4 text-[13.5px] font-semibold text-canvas disabled:opacity-60">
            {pending ? 'Aguarde…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Aviso discreto de recurso ainda não conectado. */
export function PendingNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="m-0 rounded-lg border border-line px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
      {children}
    </p>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="m-0 max-w-[60ch] text-[14px] text-fg-muted">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

/** Botão principal dourado. Desabilitado, explica o motivo no `title` e por texto associado. */
export function GoldButton({ children, disabled, reason, href }: { children: ReactNode; disabled?: boolean; reason?: string; href?: string }) {
  const cls = 'inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-brand';
  if (href && !disabled) return <a href={href} className={cls}>{children}</a>;
  return (
    <button type="button" aria-disabled="true" title={reason} onClick={(e) => e.preventDefault()} className={cls}>
      {children}
    </button>
  );
}
