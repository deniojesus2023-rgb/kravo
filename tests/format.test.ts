import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  formatDelta,
  formatInt,
  formatPercent,
  formatPeriodRange,
  formatRoas,
  formatUpdatedAt,
  formatWeekdayDay,
} from '@/lib/format';

describe('formatação pt-BR', () => {
  it('moeda', () => {
    expect(formatBRL(634_000)).toBe('R$ 6.340');
    expect(formatBRL(4_918, { decimals: 2 })).toBe('R$ 49,18');
    expect(formatBRL(997_600, { sign: true })).toBe('+R$ 9.976');
    expect(formatBRL(-79_800, { sign: true })).toBe('−R$ 798');
    expect(formatBRL(0, { sign: true })).toBe('R$ 0');
    expect(formatBRL(12_345_678)).toBe('R$ 123.457');
  });

  it('números, percentuais e ROAS', () => {
    expect(formatInt(412_600)).toBe('412.600');
    expect(formatPercent(0.061)).toBe('6,1%');
    expect(formatPercent(0.0166, 2)).toBe('1,66%');
    expect(formatRoas(3.0476)).toBe('3,05x');
    expect(formatRoas(null)).toBe('—');
  });

  it('variações com sinal', () => {
    expect(formatDelta(0.124)).toBe('+12,4%');
    expect(formatDelta(-0.063)).toBe('−6,3%');
    expect(formatDelta(0.0001)).toBe('0,0%');
  });

  it('datas e horas em America/Sao_Paulo', () => {
    expect(formatWeekdayDay('2026-10-12')).toBe('Seg 12');
    expect(formatWeekdayDay('2026-10-18')).toBe('Dom 18');
    expect(formatPeriodRange('2026-10-12', '2026-10-18')).toBe('12 a 18 out 2026');
    expect(formatPeriodRange('2026-09-28', '2026-10-04')).toBe('28 set a 4 out 2026');
    const now = '2026-10-18T11:12:00-03:00';
    expect(formatUpdatedAt(now, now)).toBe('hoje às 11:12');
    expect(formatUpdatedAt('2026-10-17T23:40:00-03:00', now)).toBe('17 out às 23:40');
  });
});
