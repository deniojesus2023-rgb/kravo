import Link from 'next/link';
import { PERIOD_OPTIONS, type PeriodId } from '@/lib/data';
import { cn } from '@/lib/cn';

/** Seletor de período. Navega por `?periodo=`, então funciona sem JavaScript e com teclado. */
export function PeriodSelector({ current }: { current: PeriodId }) {
  return (
    <nav
      aria-label="Período"
      className="flex gap-0.5 rounded-lg border border-line bg-surface-sunken p-[3px]"
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = option.id === current;
        return (
          <Link
            key={option.id}
            href={`?periodo=${option.id}`}
            aria-current={active ? 'true' : undefined}
            scroll={false}
            className={cn(
              'inline-flex h-[30px] items-center rounded-md px-3 text-[13px] whitespace-nowrap',
              active ? 'bg-line text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
