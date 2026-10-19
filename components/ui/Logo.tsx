import { cn } from '@/lib/cn';

/** Monograma Original da trakfy (brand/monogram-dark.svg). Não esticar, inclinar nem recolorir. */
export function Monogram({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="14 14 82 82" aria-hidden="true" className={className}>
      <path fill="#F5F7F8" d="M17 17 H62 V40 H44 V66 H55 V93 H49 C29 93 17 82 17 63 Z" />
      <path fill="#C8F169" d="M71 17 H93 V65 C93 83 81 93 63 93 H58 V68 H67 Q71 68 71 63 Z" />
    </svg>
  );
}

/** Monograma + wordmark "trakfy" em caixa baixa. */
export function Logo({ className, large = false }: { className?: string; large?: boolean }) {
  return (
    <span className={cn('flex items-center', large ? 'gap-3.5' : 'gap-2.5', className)}>
      <Monogram size={large ? 36 : 24} />
      <span aria-hidden="true" className={cn('leading-none font-bold tracking-[-0.05em]', large ? 'text-[34px]' : 'text-[22px]')}>
        trakfy
      </span>
      <span className="sr-only">trakfy</span>
    </span>
  );
}
