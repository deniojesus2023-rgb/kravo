/**
 * Ação por oferta: Escalar, Manter, Pausar ou Dados insuficientes.
 * Precedência: Pausar, depois Dados insuficientes, depois Escalar, depois Manter.
 * Os limites são valores iniciais e configuráveis por oferta.
 */

export type OfferAction = 'escalar' | 'manter' | 'pausar' | 'dados_insuficientes';

export const ACTION_LABELS: Record<OfferAction, string> = {
  escalar: 'Escalar',
  manter: 'Manter',
  pausar: 'Pausar',
  dados_insuficientes: 'Dados insuficientes',
};

export interface DecisionParams {
  /** Pausar: gasto mínimo (centavos) que confirma o prejuízo. */
  pauseMinSpendCents: number;
  /** Pausar: vendas mínimas que confirmam o prejuízo, mesmo com gasto menor. */
  pauseMinSales: number;
  /** Abaixo disso não há dados para decidir. */
  minSales: number;
  scaleMinRoas: number;
  scaleMinSales: number;
  /** Fração: 0,10 = 10%. */
  scaleMaxRefundRate: number;
}

export const DEFAULT_DECISION_PARAMS: DecisionParams = {
  pauseMinSpendCents: 200_000,
  pauseMinSales: 30,
  minSales: 30,
  scaleMinRoas: 2.5,
  scaleMinSales: 50,
  scaleMaxRefundRate: 0.1,
};

export interface ActionInput {
  adSpendCents: number;
  /** Vendas aprovadas no período. */
  sales: number;
  netProfitCents: number;
  /** ROAS real. `null` quando não há gasto. */
  roas: number | null;
  /** Fração. `null` quando não há receita. */
  refundRate: number | null;
}

export type CriterionUnit = 'x' | 'count' | 'percent' | 'money';
export type Comparator = '>=' | '<=' | '<';

export interface Criterion {
  id: 'roas' | 'sales' | 'refundRate' | 'netProfit' | 'adSpend';
  label: string;
  /** `null` quando o dado não existe; o critério então não é atendido. */
  value: number | null;
  unit: CriterionUnit;
  comparator: Comparator;
  threshold: number;
  met: boolean;
}

export interface ActionDecision {
  action: OfferAction;
  /** Critérios que justificam a indicação, com o resultado de cada um. */
  criteria: Criterion[];
  /** Quando os critérios não são todos obrigatórios, explica a combinação. */
  note?: string;
}

function compare(value: number | null, comparator: Comparator, threshold: number): boolean {
  if (value === null) return false;
  if (comparator === '>=') return value >= threshold;
  if (comparator === '<=') return value <= threshold;
  return value < threshold;
}

function criterion(
  id: Criterion['id'],
  label: string,
  value: number | null,
  unit: CriterionUnit,
  comparator: Comparator,
  threshold: number,
): Criterion {
  return { id, label, value, unit, comparator, threshold, met: compare(value, comparator, threshold) };
}

export function decideOfferAction(
  input: ActionInput,
  params: DecisionParams = DEFAULT_DECISION_PARAMS,
): ActionDecision {
  const loss = criterion('netProfit', 'Lucro líquido', input.netProfitCents, 'money', '<', 0);
  const pauseSpend = criterion('adSpend', 'Gasto', input.adSpendCents, 'money', '>=', params.pauseMinSpendCents);
  const pauseSales = criterion('sales', 'Vendas no período', input.sales, 'count', '>=', params.pauseMinSales);

  if (loss.met && (pauseSpend.met || pauseSales.met)) {
    return {
      action: 'pausar',
      criteria: [loss, pauseSpend, pauseSales],
      note: 'Basta atender o gasto mínimo ou o mínimo de vendas para confirmar o prejuízo.',
    };
  }

  const enoughData = criterion('sales', 'Vendas no período', input.sales, 'count', '>=', params.minSales);
  if (!enoughData.met) {
    return { action: 'dados_insuficientes', criteria: [enoughData] };
  }

  const scale = [
    criterion('roas', 'ROAS real', input.roas, 'x', '>=', params.scaleMinRoas),
    criterion('sales', 'Vendas no período', input.sales, 'count', '>=', params.scaleMinSales),
    criterion('refundRate', 'Reembolso', input.refundRate, 'percent', '<=', params.scaleMaxRefundRate),
  ];
  if (scale.every((c) => c.met)) {
    return { action: 'escalar', criteria: scale };
  }

  return {
    action: 'manter',
    criteria: scale,
    note: 'Não atende todos os critérios de Escalar e não há prejuízo confirmado.',
  };
}

const PARAM_KEYS = Object.keys(DEFAULT_DECISION_PARAMS) as Array<keyof DecisionParams>;

/**
 * Lê os limites guardados em `offers.decision_params` (jsonb). Chaves ausentes ou inválidas
 * (não numéricas, negativas) voltam ao padrão: um valor ruim nunca altera a decisão em silêncio.
 */
export function parseDecisionParams(raw: unknown): DecisionParams {
  const params = { ...DEFAULT_DECISION_PARAMS };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return params;
  const record = raw as Record<string, unknown>;
  for (const key of PARAM_KEYS) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) params[key] = value;
  }
  return params;
}
