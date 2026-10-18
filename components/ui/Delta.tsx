import { formatDelta } from '@/lib/format';
import { cn } from '@/lib/cn';

type Polarity = 'neutral' | 'higher-is-better' | 'lower-is-better';

/** Variação vs. período anterior. A cor segue o significado, e o sinal está sempre no texto. */
export function Delta({ value, polarity, className }: { value: number | null; polarity: Polarity; className?: string }) {
  if (value === null) {
    return (
      <span className={cn('num text-fg-muted', className)}>
        —<span className="sr-only"> sem base de comparação</span>
      </span>
    );
  }
  const rounded = Math.round(Math.abs(value) * 1000) / 10;
  const good = polarity === 'higher-is-better' ? value > 0 : polarity === 'lower-is-better' ? value < 0 : null;
  const tone =
    polarity === 'neutral' || rounded === 0 ? 'text-fg-muted' : good ? 'text-profit' : 'text-loss';
  return <span className={cn('num', tone, className)}>{formatDelta(value)}</span>;
}
