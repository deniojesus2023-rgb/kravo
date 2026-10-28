import type { Conversation } from './types';

export type HistoryGroupId = 'hoje' | 'ontem' | 'semana' | 'mes' | 'antigas';

export const HISTORY_LABELS: Record<HistoryGroupId, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  semana: 'Últimos 7 dias',
  mes: 'Últimos 30 dias',
  antigas: 'Mais antigas',
};

const ORDER: HistoryGroupId[] = ['hoje', 'ontem', 'semana', 'mes', 'antigas'];

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia civil em America/Sao_Paulo como número de dias desde 1970 (compara datas sem se perder em fuso). */
function dayNumber(instant: Date): number {
  const [y, m, d] = DAY_FORMAT.format(instant).split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

export function groupOf(updatedAt: string, now: Date): HistoryGroupId {
  const age = dayNumber(now) - dayNumber(new Date(updatedAt));
  if (age <= 0) return 'hoje';
  if (age === 1) return 'ontem';
  if (age <= 7) return 'semana';
  if (age <= 30) return 'mes';
  return 'antigas';
}

/** Conversas agrupadas por período, da mais recente para a mais antiga. Grupos vazios não aparecem. */
export function groupConversations(items: Conversation[], now: Date): Array<{ id: HistoryGroupId; label: string; items: Conversation[] }> {
  const sorted = [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return ORDER.map((id) => ({ id, label: HISTORY_LABELS[id], items: sorted.filter((c) => groupOf(c.updatedAt, now) === id) })).filter((g) => g.items.length > 0);
}
