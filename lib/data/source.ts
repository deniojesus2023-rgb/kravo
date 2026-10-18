import type {
  Alert,
  DataContext,
  MetaConnection,
  Offer,
  OfferPeriodData,
  PeriodDeltas,
  PeriodId,
  PeriodRange,
} from './types';

/**
 * O que uma fonte de dados (exemplo ou Supabase) precisa fornecer. As telas e as regras
 * só conhecem `lib/data/index.ts`, que usa uma fonte por requisição.
 */
export interface DataSource {
  readonly isSample: boolean;
  context(): Promise<DataContext>;
  metaConnection(): Promise<MetaConnection>;
  /** Janela do período, ou `null` quando a fonte não tem dados para ele. */
  range(period: PeriodId, now: Date): PeriodRange | null;
  /** Ofertas não arquivadas, com ou sem movimento. */
  offers(): Promise<Offer[]>;
  /** Dados brutos de todas as ofertas no período, já com variações sobre o período anterior. */
  offerPeriodData(range: PeriodRange): Promise<OfferPeriodData[]>;
  portfolioDeltas(data: OfferPeriodData[]): Pick<PeriodDeltas, 'spend' | 'revenue' | 'profit' | 'roas'>;
  alerts(): Promise<Alert[]>;
}
