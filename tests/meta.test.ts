import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret, parseKey } from '@/lib/crypto/secret';
import type { MetaEnv } from '@/lib/meta/config';
import { completeMetaConnection, type ConnectionStore } from '@/lib/meta/flow';
import { createGraph, MetaApiError, type Graph } from '@/lib/meta/graph';
import { appSecretProof, buildLoginUrl, daysLeft, deriveConnectionStatus, expiresAtFrom, newState, statesMatch } from '@/lib/meta/oauth';

const env: MetaEnv = { appId: '123', appSecret: 'segredo-do-app', configId: null, graphVersion: 'v23.0' };
const key = randomBytes(32);

describe('cifra de credenciais (AES-256-GCM)', () => {
  it('cifra e decifra, sem deixar o texto às claras', () => {
    const payload = encryptSecret('EAAB-token-secreto', key);
    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload).not.toContain('EAAB');
    expect(decryptSecret(payload, key)).toBe('EAAB-token-secreto');
  });

  it('a mesma entrada gera saídas diferentes (IV aleatório)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });

  it('chave errada ou conteúdo alterado falham sem vazar o conteúdo', () => {
    const payload = encryptSecret('EAAB-token-secreto', key);
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow(/decifrar/);
    const [v, iv, tag, data] = payload.split('.');
    const tampered = [v, iv, tag, Buffer.from('outro-conteudo').toString('base64url')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow(/decifrar/);
    try {
      decryptSecret(tampered, key);
    } catch (e) {
      expect(String(e)).not.toContain('EAAB');
    }
    expect(() => decryptSecret('lixo', key)).toThrow(/formato/);
    void data;
  });

  it('exige chave de 32 bytes', () => {
    expect(() => parseKey(undefined)).toThrow(/32 bytes/);
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseKey(key.toString('base64'))).toHaveLength(32);
  });
});

describe('login com o Facebook', () => {
  it('sem configuração de login, pede somente ads_read', () => {
    const url = new URL(buildLoginUrl(env, 'https://app.exemplo.com/api/meta/callback', 'abc'));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v23.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe('ads_read');
    expect(url.searchParams.get('config_id')).toBeNull();
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.exemplo.com/api/meta/callback');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('client_secret')).toBeNull();
    expect(url.toString()).not.toContain('segredo-do-app');
  });

  it('com configuração de login, usa config_id e não o escopo', () => {
    const url = new URL(buildLoginUrl({ ...env, configId: '999' }, 'https://x/cb', 's'));
    expect(url.searchParams.get('config_id')).toBe('999');
    expect(url.searchParams.get('scope')).toBeNull();
  });

  it('state: aleatório e comparado em tempo constante', () => {
    const a = newState();
    expect(a).not.toBe(newState());
    expect(statesMatch(a, a)).toBe(true);
    expect(statesMatch(a, a + 'x')).toBe(false);
    expect(statesMatch(undefined, a)).toBe(false);
    expect(statesMatch(a, null)).toBe(false);
  });

  it('prova do segredo do app é um HMAC-SHA256 estável', () => {
    expect(appSecretProof('tok', 'sec')).toBe(appSecretProof('tok', 'sec'));
    expect(appSecretProof('tok', 'sec')).toMatch(/^[0-9a-f]{64}$/);
    expect(appSecretProof('tok', 'outro')).not.toBe(appSecretProof('tok', 'sec'));
  });
});

describe('validade da conexão', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it('calcula a data de expiração', () => {
    expect(expiresAtFrom(now, 5_184_000)).toBe('2026-12-17T12:00:00.000Z');
    expect(expiresAtFrom(now, undefined)).toBeNull();
    expect(expiresAtFrom(now, 0)).toBeNull();
  });

  it('estado: não conectado, conectado, expirando (<7 dias) e expirado', () => {
    const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
    expect(deriveConnectionStatus(null, now)).toBe('nao_conectado');
    expect(deriveConnectionStatus({ status: 'conectado', expires_at: at(30) }, now)).toBe('conectado');
    expect(deriveConnectionStatus({ status: 'conectado', expires_at: at(6) }, now)).toBe('expirando');
    expect(deriveConnectionStatus({ status: 'conectado', expires_at: at(-1) }, now)).toBe('desconectado');
    expect(deriveConnectionStatus({ status: 'desconectado', expires_at: at(30) }, now)).toBe('desconectado');
    expect(deriveConnectionStatus({ status: 'conectado', expires_at: null }, now)).toBe('conectado');
    expect(daysLeft(at(41), now)).toBe(41);
    expect(daysLeft(at(-3), now)).toBe(0);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('cliente da Graph API', () => {
  it('troca o código por token de curta e de longa duração', async () => {
    const urls: string[] = [];
    const graph = createGraph(env, async (url) => {
      urls.push(url);
      return jsonResponse(urls.length === 1 ? { access_token: 'curto', expires_in: 3600 } : { access_token: 'longo', expires_in: 5_184_000 });
    });
    const short = await graph.exchangeCode('codigo', 'https://app/cb');
    const long = await graph.toLongLived(short.accessToken);
    expect(short).toEqual({ accessToken: 'curto', expiresInSeconds: 3600 });
    expect(long).toEqual({ accessToken: 'longo', expiresInSeconds: 5_184_000 });
    const first = new URL(urls[0]!);
    expect(first.pathname).toBe('/v23.0/oauth/access_token');
    expect(first.searchParams.get('code')).toBe('codigo');
    const second = new URL(urls[1]!);
    expect(second.searchParams.get('grant_type')).toBe('fb_exchange_token');
    expect(second.searchParams.get('fb_exchange_token')).toBe('curto');
  });

  it('chamadas com token levam appsecret_proof', async () => {
    let url = '';
    const graph = createGraph(env, async (u) => {
      url = u;
      return jsonResponse({ id: '1', name: 'Ana' });
    });
    expect(await graph.profile('tok')).toEqual({ id: '1', name: 'Ana' });
    expect(new URL(url).searchParams.get('appsecret_proof')).toBe(appSecretProof('tok', env.appSecret));
  });

  it('só considera permissões concedidas (granted)', async () => {
    const graph = createGraph(env, async () =>
      jsonResponse({ data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'email', status: 'declined' }] }),
    );
    expect(await graph.grantedPermissions('t')).toEqual(['ads_read']);
  });

  it('percorre as páginas das contas de anúncios', async () => {
    let n = 0;
    const graph = createGraph(env, async (u) => {
      n += 1;
      if (n === 1) {
        return jsonResponse({
          data: [{ id: 'act_1', account_id: '1', name: 'Conta 1', currency: 'BRL', timezone_name: 'America/Sao_Paulo', account_status: 1, business: { name: 'BM A' } }],
          paging: { cursors: { after: 'CUR' }, next: 'https://graph/...' },
        });
      }
      expect(new URL(u).searchParams.get('after')).toBe('CUR');
      return jsonResponse({ data: [{ account_id: '2', name: 'Conta 2', currency: 'USD' }] });
    });
    const accounts = await graph.adAccounts('t');
    expect(accounts).toEqual([
      { id: 'act_1', name: 'Conta 1', currency: 'BRL', timezoneName: 'America/Sao_Paulo', accountStatus: 1, businessName: 'BM A' },
      { id: 'act_2', name: 'Conta 2', currency: 'USD', timezoneName: null, accountStatus: null, businessName: null },
    ]);
  });

  it('erros não vazam URL, token nem segredo', async () => {
    const graph = createGraph(env, async () => jsonResponse({ error: { message: 'Código inválido', code: 100 } }, 400));
    const error = await graph.exchangeCode('c', 'https://app/cb').catch((e) => e);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error.code).toBe(100);
    expect(String(error.message)).toBe('Código inválido');
    const network = createGraph(env, async () => {
      throw new Error('ECONNRESET https://graph.facebook.com/?access_token=SEGREDO');
    });
    const e2 = await network.profile('SEGREDO').catch((e) => e);
    expect(String(e2.message)).not.toContain('SEGREDO');
  });
});

describe('conclusão da conexão', () => {
  const account = { id: 'act_1', name: 'Conta 1', currency: 'BRL', timezoneName: 'America/Sao_Paulo', accountStatus: 1, businessName: null };
  const okGraph = (permissions = ['ads_read']): Graph =>
    ({
      exchangeCode: vi.fn(async () => ({ accessToken: 'curto', expiresInSeconds: 3600 })),
      toLongLived: vi.fn(async () => ({ accessToken: 'longo', expiresInSeconds: 5_184_000 })),
      profile: vi.fn(async () => ({ id: 'u1', name: 'Ana' })),
      grantedPermissions: vi.fn(async () => permissions),
      adAccounts: vi.fn(async () => [account]),
      revoke: vi.fn(),
    }) as unknown as Graph;
  const input = { userId: 'user-1', code: 'cod', redirectUri: 'https://app/cb' };
  const now = () => new Date('2026-10-18T12:00:00Z');

  it('caminho feliz: testa o token com chamadas reais e só então grava', async () => {
    const store: ConnectionStore = { save: vi.fn(async () => {}) };
    const graph = okGraph();
    const result = await completeMetaConnection({ graph, store, now }, input);
    expect(result).toEqual({ ok: true, accounts: 1, permissions: ['ads_read'] });
    expect(graph.profile).toHaveBeenCalledWith('longo');
    expect(store.save).toHaveBeenCalledWith({
      userId: 'user-1',
      accessToken: 'longo',
      expiresAt: '2026-12-17T12:00:00.000Z',
      metaUserId: 'u1',
      metaUserName: 'Ana',
      permissions: ['ads_read'],
      accounts: [account],
    });
  });

  it('sem ads_read concedida, não grava nada', async () => {
    const store: ConnectionStore = { save: vi.fn() };
    const result = await completeMetaConnection({ graph: okGraph(['public_profile']), store, now }, input);
    expect(result).toEqual({ ok: false, reason: 'permissao' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('falha na troca do código informa a etapa', async () => {
    const store: ConnectionStore = { save: vi.fn() };
    const graph = okGraph();
    (graph.exchangeCode as ReturnType<typeof vi.fn>).mockRejectedValue(new MetaApiError('Código inválido', 100, 400));
    expect(await completeMetaConnection({ graph, store, now }, input)).toEqual({
      ok: false,
      reason: 'meta',
      diagnostic: { step: 'troca_do_codigo', code: 100, status: 400 },
    });
  });

  it('falha da Meta em qualquer etapa não grava nada', async () => {
    const store: ConnectionStore = { save: vi.fn() };
    const graph = okGraph();
    (graph.adAccounts as ReturnType<typeof vi.fn>).mockRejectedValue(new MetaApiError('x', 190, 401));
    expect(await completeMetaConnection({ graph, store, now }, input)).toEqual({
      ok: false,
      reason: 'meta',
      diagnostic: { step: 'leitura_de_perfil_permissoes_e_contas', code: 190, status: 401 },
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('falha ao gravar vira erro "salvar", sem expor detalhes', async () => {
    const store: ConnectionStore = { save: vi.fn(async () => { throw new Error('detalhe interno sem credencial'); }) };
    const result = await completeMetaConnection({ graph: okGraph(), store, now }, input);
    expect(result).toMatchObject({ ok: false, reason: 'salvar' });
    expect(JSON.stringify(result)).not.toContain('sk-segredo-123'); // o token nunca entra no diagnóstico
  });
});

import { describeDiagnostic, diagnosticParams } from '@/lib/meta/diagnostic';

describe('detalhe técnico na tela', () => {
  it('só leva listas fixas e números pela URL', () => {
    expect(diagnosticParams({ step: 'troca_do_codigo', code: 100, status: 400 })).toEqual({ etapa: 'troca_do_codigo', codigo: '100', http: '400' });
    expect(diagnosticParams({ step: '<script>alert(1)</script>', code: null, status: 0 })).toEqual({ http: '0' });
    expect(diagnosticParams({ detail: 'falha ao gravar credencial' })).toEqual({ salvar: 'credencial' });
    expect(diagnosticParams({ detail: 'TOKEN_ENCRYPTION_KEY inválida: precisa ser uma chave de 32 bytes em base64.' })).toEqual({ salvar: 'chave' });
    expect(diagnosticParams({ detail: 'algo com EAAB-token' })).toEqual({});
    expect(diagnosticParams(undefined)).toEqual({});
  });

  it('descreve em português e ignora valores forjados', () => {
    expect(describeDiagnostic({ etapa: 'troca_do_codigo', codigo: '100', http: '400' })).toBe(
      'etapa: troca do código do login por um token · código da Meta: 100 · status HTTP: 400',
    );
    expect(describeDiagnostic({ http: '0' })).toBe('sem resposta da Meta');
    expect(describeDiagnostic({ etapa: 'qualquer coisa', codigo: '12ab', http: '99999', salvar: 'x' })).toBeNull();
    expect(describeDiagnostic({})).toBeNull();
  });
});
