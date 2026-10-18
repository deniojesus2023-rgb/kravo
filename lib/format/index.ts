/**
 * Formatação pt-BR. Escrita à mão (sem Intl) para o resultado ser idêntico
 * no servidor, no navegador e nos testes. O sinal negativo é o "−" (U+2212).
 */

const MINUS = '−';

function groupThousands(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Arredonda para `decimals` casas (meio para longe de zero) sem erro de ponto flutuante visível. */
function toFixedPtBr(value: number, decimals: number): string {
  const abs = Math.abs(value);
  const fixed = (Math.round((abs + Number.EPSILON) * 10 ** decimals) / 10 ** decimals).toFixed(decimals);
  const [integer = '0', fraction] = fixed.split('.');
  return fraction ? `${groupThousands(integer)},${fraction}` : groupThousands(integer);
}

function signOf(value: number, forcePlus: boolean): string {
  if (value < 0) return MINUS;
  return forcePlus && value > 0 ? '+' : '';
}

/** Número com separadores pt-BR: 412600 → "412.600". */
export function formatInt(value: number): string {
  return `${signOf(value, false)}${toFixedPtBr(value, 0)}`;
}

/**
 * Moeda BRL a partir de centavos.
 * `formatBRL(634000)` → "R$ 6.340"; `formatBRL(4918, { decimals: 2 })` → "R$ 49,18".
 * `sign: true` acrescenta "+" aos positivos: "+R$ 9.976".
 */
export function formatBRL(cents: number, options: { decimals?: 0 | 2; sign?: boolean } = {}): string {
  const { decimals = 0, sign = false } = options;
  const reais = cents / 100;
  const rounded = Math.round(Math.abs(reais) * 10 ** decimals) / 10 ** decimals;
  const prefix = rounded === 0 ? '' : signOf(reais, sign);
  return `${prefix}R$ ${toFixedPtBr(reais, decimals)}`;
}

/** Fração em porcentagem: 0.061 → "6,1%". */
export function formatPercent(fraction: number, decimals = 1): string {
  return `${toFixedPtBr(fraction * 100, decimals)}%`;
}

/** Variação com sinal: 0.124 → "+12,4%", −0.063 → "−6,3%". */
export function formatDelta(fraction: number, decimals = 1): string {
  const rounded = Math.round(Math.abs(fraction) * 100 * 10 ** decimals) / 10 ** decimals;
  const prefix = rounded === 0 ? '' : fraction < 0 ? MINUS : '+';
  return `${prefix}${toFixedPtBr(fraction * 100, decimals)}%`;
}

/** ROAS: 3.047 → "3,05x". `null` vira travessão. */
export function formatRoas(value: number | null): string {
  return value === null ? '—' : `${toFixedPtBr(value, 2)}x`;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function parseIsoDate(iso: string): { y: number; m: number; d: number; weekday: number } {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "2026-10-12" → "Seg 12" */
export function formatWeekdayDay(iso: string): string {
  const { d, weekday } = parseIsoDate(iso);
  return `${WEEKDAYS[weekday]} ${d}`;
}

/** ("2026-10-12", "2026-10-18") → "12 a 18 out 2026"; atravessando meses: "28 set a 4 out 2026". */
export function formatPeriodRange(startIso: string, endIso: string): string {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  const startPart = a.m === b.m && a.y === b.y ? `${a.d}` : `${a.d} ${MONTHS[a.m - 1]}`;
  return `${startPart} a ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/** Janela curta sem ano: "12 a 18 out". */
export function formatPeriodShort(startIso: string, endIso: string): string {
  return formatPeriodRange(startIso, endIso).replace(/ \d{4}$/, '');
}

const SAO_PAULO = 'America/Sao_Paulo';

function saoPauloParts(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** "hoje às 11:12" quando for o mesmo dia (America/Sao_Paulo) de `nowIso`; senão "18 out às 11:12". */
export function formatUpdatedAt(iso: string, nowIso: string): string {
  const at = saoPauloParts(iso);
  const now = saoPauloParts(nowIso);
  if (at.date === now.date) return `hoje às ${at.time}`;
  const { d, m } = parseIsoDate(at.date);
  return `${d} ${MONTHS[m - 1]} às ${at.time}`;
}

/** "2026-11-28T03:00:00Z" → "28 nov 2026", no dia civil de America/Sao_Paulo. */
export function formatDateShort(iso: string): string {
  const { date } = saoPauloParts(iso);
  const { y, m, d } = parseIsoDate(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
