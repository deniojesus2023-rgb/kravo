import { cn } from '@/lib/cn';

/** Monograma "A": letra geométrica em dourado sobre grafite. Sem personagens nem ilustração. */
export function AlfredMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn('flex-none', className)}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
      <path fill="var(--color-brand)" fillRule="evenodd" d="M16 6.5 25.5 26h-4.2l-1.8-4.1h-7L10.7 26H6.5L16 6.5Zm0 8.2-2.4 5.5h4.8L16 14.7Z" />
    </svg>
  );
}

/** Monograma + nome + assinatura. */
export function AlfredBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <AlfredMark size={compact ? 28 : 36} />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-semibold tracking-[0.18em]">ALFRED</span>
        {!compact && <span className="mt-1.5 text-[10.5px] tracking-[0.2em] text-fg-subtle uppercase">Strategic Intelligence</span>}
      </span>
    </span>
  );
}
