import type { Alert, MetaConnection, OfferPeriodData, PeriodDeltas } from '../types';
import { buildOfferPeriodData } from './build';
import { OFFER_SEEDS } from './seeds';

/** Instante de referência dos dados de exemplo (America/Sao_Paulo). */
export const SAMPLE_NOW = '2026-10-18T11:12:00-03:00';

export const SAMPLE_SOURCES = ['Meta Ads', 'Hotmart', 'Kiwify', 'Eduzz'];

export const SAMPLE_OFFERS: OfferPeriodData[] = OFFER_SEEDS.map(buildOfferPeriodData);

/** Variação do portfólio vs. 7 dias anteriores, como aparece no design. */
export const SAMPLE_PORTFOLIO_DELTAS: Pick<PeriodDeltas, 'spend' | 'revenue' | 'profit' | 'roas'> = {
  spend: 0.124,
  revenue: 0.218,
  profit: 0.346,
  roas: 0.083,
};

export const SAMPLE_ALERTS: Alert[] = [
  {
    id: 'alerta-1',
    offerId: 'codigo-metabolico',
    severity: 'media',
    reason: 'O CPA de Código Metabólico aumentou 28% nos últimos 3 dias.',
    recommendedAction: 'Revise a campanha antes de elevar o orçamento.',
    source: 'Meta Ads',
    updatedAt: SAMPLE_NOW,
  },
];

export const SAMPLE_META_CONNECTION: MetaConnection = {
  status: 'conectado',
  lastSync: { source: 'Meta Ads', finishedAt: '2026-10-18T11:06:00-03:00', delayMinutes: 6, ok: true },
};
