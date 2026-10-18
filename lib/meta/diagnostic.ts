/**
 * Detalhe técnico mostrado na tela de Integrações quando a conexão falha. Só viaja pela URL
 * valores de listas fixas e números: nada sensível, e nada que um link forjado possa usar
 * para exibir texto arbitrário.
 */

const STEPS: Record<string, string> = {
  troca_do_codigo: 'troca do código do login por um token',
  token_de_longa_duracao: 'troca por um token de longa duração',
  leitura_de_perfil_permissoes_e_contas: 'leitura do perfil, das permissões e das contas de anúncios',
};

const SAVE: Record<string, string> = {
  ler: 'ao ler a conexão',
  atualizar: 'ao atualizar a conexão',
  criar: 'ao criar a conexão',
  credencial: 'ao gravar a credencial cifrada',
  contas: 'ao gravar as contas de anúncios',
  chave: 'chave de criptografia inválida',
};

export interface DiagnosticInput {
  step?: string;
  code?: number | null;
  subcode?: number | null;
  status?: number;
  detail?: string;
}

/** Parâmetros de URL para anexar ao redirecionamento. */
export function diagnosticParams(d: DiagnosticInput | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!d) return out;
  if (d.step && d.step in STEPS) out.etapa = d.step;
  if (typeof d.code === 'number' && Number.isInteger(d.code) && d.code >= 0 && d.code < 1_000_000) out.codigo = String(d.code);
  if (typeof d.subcode === 'number' && Number.isInteger(d.subcode) && d.subcode >= 0 && d.subcode < 10_000_000) out.sub = String(d.subcode);
  if (typeof d.status === 'number' && Number.isInteger(d.status) && d.status >= 0 && d.status < 1000) out.http = String(d.status);
  if (d.detail) {
    const key = d.detail.includes('TOKEN_ENCRYPTION_KEY')
      ? 'chave'
      : d.detail.includes('credencial')
        ? 'credencial'
        : d.detail.includes('contas')
          ? 'contas'
          : d.detail.includes('atualizar')
            ? 'atualizar'
            : d.detail.includes('criar')
              ? 'criar'
              : d.detail.includes('ler')
                ? 'ler'
                : null;
    if (key) out.salvar = key;
  }
  return out;
}

/** Texto do detalhe a partir da URL, ou `null`. Valores fora das listas fixas são ignorados. */
export function describeDiagnostic(params: { etapa?: string; codigo?: string; sub?: string; http?: string; salvar?: string }): string | null {
  const parts: string[] = [];
  if (params.etapa && params.etapa in STEPS) parts.push(`etapa: ${STEPS[params.etapa]}`);
  if (params.salvar && params.salvar in SAVE) parts.push(`falha ${SAVE[params.salvar]}`);
  if (params.codigo && /^\d{1,6}$/.test(params.codigo)) parts.push(`código da Meta: ${params.codigo}`);
  if (params.sub && /^\d{1,7}$/.test(params.sub)) parts.push(`subcódigo: ${params.sub}`);
  if (params.http && /^\d{1,3}$/.test(params.http)) {
    parts.push(params.http === '0' ? 'sem resposta da Meta' : `status HTTP: ${params.http}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

import type { MetaEnv } from './config';
import type { ConnectResult } from './flow';

/**
 * Entrada do log `meta_conexao_falhou`. Só campos escolhidos: nunca token, código do login, state,
 * chave secreta nem o corpo bruto da resposta. Os formatos do ID e da chave do app saem como
 * verdadeiro/falso, sem revelar o valor.
 */
export function failureLogEntry(result: Extract<ConnectResult, { ok: false }>, env: MetaEnv | null): Record<string, unknown> {
  const d = result.diagnostic ?? {};
  const probe = d.appCredentialsValid;
  return {
    evento: 'meta_conexao_falhou',
    reason: result.reason,
    etapa: d.step,
    codigo: d.code,
    subcodigo: d.subcode,
    status: d.status,
    tipo: d.type,
    fbtrace_id: d.fbtraceId,
    mensagem_meta: d.metaMessage,
    redirect_host: d.redirectHost,
    redirect_path: d.redirectPath,
    credenciais_do_app: probe === undefined ? undefined : probe === null ? 'indeterminado' : probe ? 'validas' : 'invalidas',
    formato_app_id_ok: env ? /^\d{10,20}$/.test(env.appId) : undefined,
    formato_chave_secreta_ok: env ? /^[0-9a-f]{32}$/i.test(env.appSecret) : undefined,
    usa_config_id: env ? Boolean(env.configId) : undefined,
    versao_graph: env?.graphVersion,
    detalhe: d.detail,
  };
}
