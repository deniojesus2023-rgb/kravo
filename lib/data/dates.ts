import type { PeriodId, PeriodRange } from './types';

/** Dia civil "YYYY-MM-DD" em America/Sao_Paulo para um instante. */
export function saoPauloDate(instant: Date | string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Todos os dias de `start` a `end`, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) out.push(day);
  return out;
}

const WINDOWS: Partial<Record<PeriodId, { back: number; length: number; label: string }>> = {
  hoje: { back: 0, length: 1, label: 'vs. ontem' },
  ontem: { back: 1, length: 1, label: 'vs. dia anterior' },
  '7d': { back: 0, length: 7, label: 'vs. 7 dias anteriores' },
  '30d': { back: 0, length: 30, label: 'vs. 30 dias anteriores' },
};

/**
 * Janela de um período relativo a `today` (dia atual em São Paulo) e a janela anterior de mesma duração.
 * "Personalizado" ainda não tem seletor de datas e devolve `null`.
 */
export function periodRange(id: PeriodId, today: string): PeriodRange | null {
  const w = WINDOWS[id];
  if (!w) return null;
  const end = addDays(today, -w.back);
  const start = addDays(end, -(w.length - 1));
  return {
    id,
    start,
    end,
    previousStart: addDays(start, -w.length),
    previousEnd: addDays(start, -1),
    comparisonLabel: w.label,
  };
}
