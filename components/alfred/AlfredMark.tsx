import { cn } from '@/lib/cn';

/** Marca do Alfred: um "A" geométrico na cor de marca da trakfy, sobre a superfície. Sem personagens nem ilustração. */
export function AlfredMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={cn('flex-none', className)}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
      <path fill="var(--color-brand)" fillRule="evenodd" d="M16 6.5 25.5 26h-4.2l-1.8-4.1h-7L10.7 26H6.5L16 6.5Zm0 8.2-2.4 5.5h4.8L16 14.7Z" />
    </svg>
  );
}
