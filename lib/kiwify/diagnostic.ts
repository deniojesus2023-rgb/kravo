/**
 * Detalhe técnico mostrado no card da Kiwify quando a conexão falha. Só viaja pela URL valores de listas fixas e
 * números: nada sensível, e nada que um link forjado possa usar para exibir texto arbitrário.
 */

const STEPS: Record<string, string> = {
  token: 'troca das credenciais por um token (oauth/token)',
  produtos: 'leitura dos produtos (confirma o ID da conta)',
};

export interface KiwifyDiagnosticInput {
  step?: string;
  status?: number;
}

export function kiwifyDiagnosticParams(d: KiwifyDiagnosticInput | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!d) return out;
  if (d.step && d.step in STEPS) out.kstep = d.step;
  if (typeof d.status === 'number' && Number.isInteger(d.status) && d.status >= 0 && d.status < 1000) out.khttp = String(d.status);
  return out;
}

/** Texto do detalhe técnico a partir dos parâmetros da URL. Parâmetro desconhecido ou forjado é ignorado. */
export function describeKiwifyDiagnostic(query: { kstep?: string; khttp?: string }): string | null {
  const parts: string[] = [];
  if (query.kstep && Object.hasOwn(STEPS, query.kstep)) parts.push(`etapa: ${STEPS[query.kstep]}`);
  if (query.khttp && /^\d{1,3}$/.test(query.khttp)) parts.push(`status HTTP: ${query.khttp}`);
  return parts.length ? parts.join(' · ') : null;
}
