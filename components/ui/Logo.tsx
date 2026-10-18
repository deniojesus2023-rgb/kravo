import { cn } from '@/lib/cn';

/** Monograma K (brand/monogram-dark.svg). Não esticar, inclinar nem recolorir. */
export function Monogram({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <path d="M25 17 V83 M75 17 L28 50 L75 83" fill="none" stroke="#C8F169" strokeWidth="11" strokeLinejoin="miter" />
    </svg>
  );
}

/** Monograma + wordmark "kavro" em caixa baixa. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <Monogram />
      <span aria-hidden="true" className="text-[22px] leading-none font-bold tracking-[-0.05em]">
        kavro
      </span>
      <span className="sr-only">kavro</span>
    </span>
  );
}
