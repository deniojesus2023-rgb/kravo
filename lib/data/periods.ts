import type { PeriodId } from './types';

export const PERIOD_OPTIONS: ReadonlyArray<{ id: PeriodId; label: string }> = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'personalizado', label: 'Personalizado' },
];

export const DEFAULT_PERIOD: PeriodId = '7d';

export function parsePeriod(value: string | string[] | undefined): PeriodId {
  const raw = Array.isArray(value) ? value[0] : value;
  return PERIOD_OPTIONS.some((p) => p.id === raw) ? (raw as PeriodId) : DEFAULT_PERIOD;
}
