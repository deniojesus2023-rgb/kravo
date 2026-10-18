import { ACTION_LABELS, type OfferAction } from '@/lib/rules';
import { cn } from '@/lib/cn';

const BADGE: Record<OfferAction, string> = {
  escalar: 'bg-profit/14 text-profit',
  manter: 'bg-surface-raised text-fg-muted',
  pausar: 'bg-loss/14 text-loss',
  dados_insuficientes: 'border border-dashed border-state-dashed text-fg-muted',
};

const DOT: Record<OfferAction, string> = {
  escalar: 'bg-profit',
  manter: 'bg-state-neutral',
  pausar: 'bg-loss',
  dados_insuficientes: 'border border-fg-subtle',
};

/** Estado da oferta sempre com texto, nunca só cor. */
export function ActionBadge({ action, className }: { action: OfferAction; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap',
        BADGE[action],
        className,
      )}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

/** Ponto de estado (decorativo). Use junto de um texto, visível ou `sr-only`. */
export function ActionDot({ action, className }: { action: OfferAction; className?: string }) {
  return <span aria-hidden="true" className={cn('size-[7px] flex-none rounded-full', DOT[action], className)} />;
}
