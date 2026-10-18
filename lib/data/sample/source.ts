import { DEFAULT_PERIOD } from '../periods';
import type { DataSource } from '../source';
import { SAMPLE_PERIOD } from './build';
import {
  SAMPLE_ALERTS,
  SAMPLE_META_CONNECTION,
  SAMPLE_NOW,
  SAMPLE_OFFERS,
  SAMPLE_PORTFOLIO_DELTAS,
  SAMPLE_SOURCES,
} from './index';

/** Fonte de dados de EXEMPLO. Só o período de 7 dias tem dados. */
export const sampleSource: DataSource = {
  isSample: true,

  async context() {
    return {
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      attributionWindow: '7 dias após o clique',
      coverage: { periodId: DEFAULT_PERIOD, ...SAMPLE_PERIOD },
      now: SAMPLE_NOW,
      updatedAt: SAMPLE_META_CONNECTION.lastSync?.finishedAt ?? null,
      isSample: true,
      sources: SAMPLE_SOURCES,
    };
  },

  async metaConnection() {
    return SAMPLE_META_CONNECTION;
  },

  range(period) {
    return period === DEFAULT_PERIOD
      ? { id: period, ...SAMPLE_PERIOD, previousStart: '2026-10-05', previousEnd: '2026-10-11', comparisonLabel: 'vs. 7 dias anteriores' }
      : null;
  },

  async offers() {
    return SAMPLE_OFFERS.map((o) => o.offer);
  },

  async offerPeriodData() {
    return SAMPLE_OFFERS;
  },

  portfolioDeltas() {
    return SAMPLE_PORTFOLIO_DELTAS;
  },

  async alerts() {
    return SAMPLE_ALERTS;
  },
};
