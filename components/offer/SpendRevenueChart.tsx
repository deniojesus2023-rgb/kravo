import { formatBRL, formatInt, formatWeekdayDay } from '@/lib/format';

interface DayPoint {
  date: string;
  spendCents: number;
  revenueCents: number;
}

const W = 820;
const TOP = 20;
const BOTTOM = 220;
const LEFT = 56;
const RIGHT = 816;
const FIRST_X = 76;
const LAST_X = 796;
const GRID_LINES = 5;

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10^k) que cobre o máximo em 5 divisões. */
function niceStep(maxReais: number): number {
  const raw = Math.max(maxReais, 1) / GRID_LINES;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].find((n) => n >= raw / magnitude) ?? 10;
  return nice * magnitude;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Gráfico de linhas SVG próprio: receita aprovada x gasto em mídia por dia. */
export function SpendRevenueChart({ days }: { days: DayPoint[] }) {
  const maxReais = Math.max(...days.flatMap((d) => [d.spendCents, d.revenueCents])) / 100;
  const step = niceStep(maxReais);
  const yMax = step * GRID_LINES;

  const x = (i: number) => (days.length === 1 ? (FIRST_X + LAST_X) / 2 : FIRST_X + ((LAST_X - FIRST_X) * i) / (days.length - 1));
  const y = (cents: number) => r1(BOTTOM - ((cents / 100) / yMax) * (BOTTOM - TOP));

  const revenuePoints = days.map((d, i) => `${x(i)},${y(d.revenueCents)}`);
  const spendPoints = days.map((d, i) => `${x(i)},${y(d.spendCents)}`);
  const peakIndex = days.reduce((best, d, i, all) => (d.revenueCents > (all[best]?.revenueCents ?? 0) ? i : best), 0);
  const peak = days[peakIndex]!;

  const first = days[0]!;
  const last = days[days.length - 1]!;
  const lo = (pick: (d: DayPoint) => number) => Math.min(...days.map(pick));
  const hi = (pick: (d: DayPoint) => number) => Math.max(...days.map(pick));
  const description =
    `Gráfico de gasto e receita por dia, de ${formatWeekdayDay(first.date)} a ${formatWeekdayDay(last.date)}. ` +
    `A receita varia entre ${formatBRL(lo((d) => d.revenueCents))} e ${formatBRL(hi((d) => d.revenueCents))} por dia ` +
    `e o gasto entre ${formatBRL(lo((d) => d.spendCents))} e ${formatBRL(hi((d) => d.spendCents))}.`;

  return (
    <>
      <svg viewBox={`0 0 ${W} 260`} width="100%" role="img" aria-label={description} className="block h-auto">
        <g className="stroke-line" strokeWidth="1">
          {Array.from({ length: GRID_LINES + 1 }, (_, k) => {
            const gy = TOP + ((BOTTOM - TOP) * k) / GRID_LINES;
            return <line key={k} x1={LEFT} x2={RIGHT} y1={gy} y2={gy} />;
          })}
        </g>
        <g className="fill-fg-subtle" fontFamily="var(--font-mono)" fontSize="11" textAnchor="end">
          {Array.from({ length: GRID_LINES + 1 }, (_, k) => (
            <text key={k} x={46} y={TOP + ((BOTTOM - TOP) * k) / GRID_LINES + 4}>
              {formatInt(yMax - step * k)}
            </text>
          ))}
        </g>
        <g className="fill-fg-muted" fontSize="12" textAnchor="middle">
          {days.map((d, i) => (
            <text key={d.date} x={x(i)} y={246}>
              {formatWeekdayDay(d.date)}
            </text>
          ))}
        </g>
        <path
          d={`M${revenuePoints.join(' L')} L${x(days.length - 1)},${BOTTOM} L${x(0)},${BOTTOM} Z`}
          className="fill-fg/7"
        />
        <polyline points={spendPoints.join(' ')} fill="none" className="stroke-fg-subtle" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={revenuePoints.join(' ')} fill="none" className="stroke-fg" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <g className="fill-canvas stroke-fg" strokeWidth="2">
          {days.map((d, i) => (
            <circle key={d.date} cx={x(i)} cy={y(d.revenueCents)} r={i === peakIndex ? 4.5 : 3.5} />
          ))}
        </g>
        <text
          x={x(peakIndex)}
          y={Math.max(11, y(peak.revenueCents) - 10)}
          className="fill-fg"
          fontFamily="var(--font-mono)"
          fontSize="11"
          textAnchor="middle"
        >
          {formatBRL(peak.revenueCents)}
        </text>
      </svg>

      <table className="sr-only">
        <caption>Gasto e receita aprovada por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Receita</th>
            <th scope="col">Gasto</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th scope="row">{formatWeekdayDay(d.date)}</th>
              <td>{formatBRL(d.revenueCents)}</td>
              <td>{formatBRL(d.spendCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
