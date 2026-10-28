import { describe, expect, it } from 'vitest';
import { CONTEXT_CHARS, fitContext, sendMessage, titleFrom, type ChatStore, type Quota } from '@/lib/alfred/chat';
import { chatConfig, chatStatus, DEFAULT_DAILY_LIMIT, dailyLimit, embeddingConfig, MAX_DAILY_LIMIT } from '@/lib/alfred/config';
import { ERROR_TEXT, MAX_MESSAGE_CHARS } from '@/lib/alfred/errors';
import { ModelError, classifyProviderError, createOpenAIModel, isValidModelId, type AlfredModel, type ChatTurn } from '@/lib/alfred/model';
import { ALFRED_SYSTEM_PROMPT } from '@/lib/alfred/persona';

const KEY = 'sk-teste-chave-falsa-0123456789';

function memory(initial: Record<string, ChatTurn[]> = {}) {
  const convs = new Map(Object.entries(initial).map(([id, t]) => [id, { turns: [...t], title: 'x' }]));
  let n = 0;
  const store: ChatStore = {
    conversationExists: async (id) => convs.has(id),
    createConversation: async (title) => {
      const id = `c${++n}`;
      convs.set(id, { turns: [], title });
      return id;
    },
    addMessage: async (id, role, content) => {
      convs.get(id)!.turns.push({ role, content });
      return { id: `m${++n}`, role, content, createdAt: '2026-10-28T12:00:00Z' };
    },
    recentTurns: async (id, limit) => convs.get(id)!.turns.slice(-limit),
    touch: async () => undefined,
  };
  const usage = { count: 0, refunds: 0 };
  const quota: Quota = {
    consume: async (_d, limit) => (usage.count >= limit ? null : ++usage.count),
    refund: async () => void (usage.count -= 1, (usage.refunds += 1)),
  };
  return { store, quota, convs, usage };
}
const model = (reply: string | Error): AlfredModel & { calls: Array<{ system: string; turns: ChatTurn[] }> } => {
  const calls: Array<{ system: string; turns: ChatTurn[] }> = [];
  return { calls, complete: async (system, turns) => (calls.push({ system, turns }), reply instanceof Error ? Promise.reject(reply) : reply) };
};
const NOW = new Date('2026-10-28T15:00:00Z');

describe('envio de mensagem', () => {
  it('conversa nova: cria, grava pergunta e resposta, e manda o prompt do Alfred', async () => {
    const m = memory();
    const llm = model('## DIAGNÓSTICO\nok');
    const r = await sendMessage({ store: m.store, quota: m.quota, model: llm, dailyLimit: 50, now: NOW }, { conversationId: null, text: '  Analise minha oferta  ' });
    expect(r).toMatchObject({ ok: true, conversationId: 'c1' });
    expect(m.convs.get('c1')!.turns).toEqual([{ role: 'user', content: 'Analise minha oferta' }, { role: 'assistant', content: '## DIAGNÓSTICO\nok' }]);
    expect(m.convs.get('c1')!.title).toBe('Analise minha oferta');
    expect(llm.calls[0]!.system).toBe(ALFRED_SYSTEM_PROMPT);
    expect(llm.calls[0]!.turns).toEqual([{ role: 'user', content: 'Analise minha oferta' }]);
    expect(m.usage.count).toBe(1);
  });

  it('conversa existente leva o histórico como contexto', async () => {
    const m = memory({ c9: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }] });
    const llm = model('resposta');
    await sendMessage({ store: m.store, quota: m.quota, model: llm, dailyLimit: 50, now: NOW }, { conversationId: 'c9', text: 'e agora?' });
    expect(llm.calls[0]!.turns.map((t) => t.content)).toEqual(['oi', 'olá', 'e agora?']);
  });

  it('rejeita vazio, texto longo e conversa que não existe, sem gastar cota nem chamar o modelo', async () => {
    const m = memory();
    const llm = model('x');
    const deps = { store: m.store, quota: m.quota, model: llm, dailyLimit: 50, now: NOW };
    expect(await sendMessage(deps, { conversationId: null, text: '   ' })).toEqual({ ok: false, error: 'mensagem_vazia' });
    expect(await sendMessage(deps, { conversationId: null, text: 'a'.repeat(MAX_MESSAGE_CHARS + 1) })).toEqual({ ok: false, error: 'mensagem_longa' });
    expect(await sendMessage(deps, { conversationId: 'nao-existe', text: 'oi' })).toEqual({ ok: false, error: 'conversa_inexistente' });
    expect(llm.calls).toHaveLength(0);
    expect(m.usage.count).toBe(0);
    expect(m.convs.size).toBe(0);
  });

  it('limite diário: bloqueia sem chamar o modelo e sem criar conversa', async () => {
    const m = memory();
    const llm = model('ok');
    const deps = { store: m.store, quota: m.quota, model: llm, dailyLimit: 2, now: NOW };
    expect((await sendMessage(deps, { conversationId: null, text: 'um' })).ok).toBe(true);
    expect((await sendMessage(deps, { conversationId: null, text: 'dois' })).ok).toBe(true);
    expect(await sendMessage(deps, { conversationId: null, text: 'três' })).toEqual({ ok: false, error: 'limite_diario' });
    expect(llm.calls).toHaveLength(2);
    expect(m.convs.size).toBe(2);
  });

  it('falha do modelo: nada é gravado, a cota volta e o erro é um código fixo', async () => {
    const m = memory();
    const r = await sendMessage({ store: m.store, quota: m.quota, model: model(new ModelError('limite_do_provedor')), dailyLimit: 50, now: NOW }, { conversationId: null, text: 'oi' });
    expect(r).toEqual({ ok: false, error: 'limite_do_provedor' });
    expect(m.convs.size).toBe(0);
    expect(m.usage).toEqual({ count: 0, refunds: 1 });
    const r2 = await sendMessage({ store: m.store, quota: m.quota, model: model(new Error(`boom ${KEY}`)), dailyLimit: 50, now: NOW }, { conversationId: null, text: 'oi' });
    expect(r2).toEqual({ ok: false, error: 'indisponivel' });
    expect(JSON.stringify(r2)).not.toContain(KEY);
  });

  it('falha ao salvar depois da resposta devolve a cota', async () => {
    const m = memory();
    m.store.addMessage = async () => {
      throw new Error('db');
    };
    const r = await sendMessage({ store: m.store, quota: m.quota, model: model('ok'), dailyLimit: 50, now: NOW }, { conversationId: null, text: 'oi' });
    expect(r).toEqual({ ok: false, error: 'falha_ao_salvar' });
    expect(m.usage.refunds).toBe(1);
  });

  it('o dia da cota é o de São Paulo', async () => {
    const days: string[] = [];
    const m = memory();
    m.quota.consume = async (d) => (days.push(d), 1);
    // 02:00 UTC de 29/10 ainda é 23h de 28/10 em São Paulo.
    await sendMessage({ store: m.store, quota: m.quota, model: model('ok'), dailyLimit: 50, now: new Date('2026-10-29T02:00:00Z') }, { conversationId: null, text: 'oi' });
    expect(days).toEqual(['2026-10-28']);
  });

  it('todo código de erro tem texto em português', () => {
    for (const text of Object.values(ERROR_TEXT)) expect(text.length).toBeGreaterThan(10);
  });
});

describe('contexto e título', () => {
  it('título: primeira linha, sem espaços repetidos, com teto', () => {
    expect(titleFrom('\n\n  Analise   minha oferta\nsegunda linha')).toBe('Analise minha oferta');
    expect(titleFrom('a'.repeat(100))).toHaveLength(60);
    expect(titleFrom('a'.repeat(100)).endsWith('…')).toBe(true);
  });
  it('contexto: respeita o limite de caracteres, mantém o mais recente e começa por mensagem do usuário', () => {
    const big = (role: ChatTurn['role'], n: number) => ({ role, content: 'x'.repeat(n) });
    const out = fitContext([big('user', 20_000), big('assistant', 20_000), big('user', 5_000), big('assistant', 5_000), big('user', 100)]);
    expect(out.map((t) => t.content.length)).toEqual([5_000, 5_000, 100]);
    expect(out[0]!.role).toBe('user');
    expect(out.reduce((a, t) => a + t.content.length, 0)).toBeLessThanOrEqual(CONTEXT_CHARS);
    expect(fitContext([big('user', CONTEXT_CHARS + 500)])).toHaveLength(1);
  });
});

describe('provedor OpenAI', () => {
  const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  const fail = (status: number, code?: string) => new Response(JSON.stringify({ error: { code, message: `detalhe com ${KEY}` } }), { status });
  const run = (res: Response | Error) => {
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const llm = createOpenAIModel({ apiKey: KEY, model: 'modelo-x', fetcher: async (url, init) => (seen.push({ url, headers: init.headers, body: JSON.parse(init.body) }), res instanceof Error ? Promise.reject(res) : res) });
    return { llm, seen };
  };

  it('monta a requisição: chave no cabeçalho, prompt de sistema primeiro, sem temperature', async () => {
    const { llm, seen } = run(ok('  resposta  '));
    expect(await llm.complete('SISTEMA', [{ role: 'user', content: 'oi' }])).toBe('resposta');
    expect(seen[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(seen[0]!.body)).not.toContain(KEY);
    expect(seen[0]!.body).toMatchObject({ model: 'modelo-x', messages: [{ role: 'system', content: 'SISTEMA' }, { role: 'user', content: 'oi' }] });
    expect(seen[0]!.body).not.toHaveProperty('temperature');
  });

  it.each([
    [401, undefined, 'chave_invalida'],
    [403, undefined, 'chave_invalida'],
    [429, 'insufficient_quota', 'sem_credito'],
    [429, 'rate_limit_exceeded', 'limite_do_provedor'],
    [404, 'model_not_found', 'modelo_invalido'],
    [400, 'model_not_found', 'modelo_invalido'],
    [400, 'unsupported_parameter', 'requisicao_recusada'],
    [500, undefined, 'indisponivel'],
    [503, undefined, 'indisponivel'],
  ])('HTTP %s (%s) vira %s, sem vazar a chave', async (status, code, kind) => {
    const { llm } = run(fail(status as number, code));
    const err = await llm.complete('s', [{ role: 'user', content: 'oi' }]).catch((e) => e);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.kind).toBe(kind);
    expect(String(err.message)).not.toContain(KEY);
  });

  it('rede fora do ar e resposta vazia', async () => {
    expect((await run(new Error('rede')).llm.complete('s', []).catch((e) => e)).kind).toBe('indisponivel');
    for (const bad of [ok(''), ok('   '), ok(null), ok(42), new Response('{}', { status: 200 })]) {
      expect((await run(bad).llm.complete('s', []).catch((e) => e)).kind).toBe('resposta_vazia');
    }
  });
});

describe('configuração do chat', () => {
  it('só funciona com banco, sessão, chave e modelo; não expõe a chave', () => {
    const env = { OPENAI_API_KEY: KEY, ALFRED_MODEL: 'modelo-x' };
    expect(chatStatus({ supabase: false, signedIn: true, env })).toEqual({ available: false, reason: 'sem_banco' });
    expect(chatStatus({ supabase: true, signedIn: false, env })).toEqual({ available: false, reason: 'sem_login' });
    expect(chatStatus({ supabase: true, signedIn: true, env: { ALFRED_MODEL: 'm' } })).toEqual({ available: false, reason: 'sem_chave' });
    expect(chatStatus({ supabase: true, signedIn: true, env: { OPENAI_API_KEY: KEY } })).toEqual({ available: false, reason: 'sem_modelo' });
    const on = chatStatus({ supabase: true, signedIn: true, env });
    expect(on).toEqual({ available: true, model: 'modelo-x', dailyLimit: DEFAULT_DAILY_LIMIT });
    expect(JSON.stringify(on)).not.toContain(KEY);
  });
  it('limite diário: padrão 50, ajustável, nunca inválido', () => {
    expect(dailyLimit({})).toBe(50);
    expect(dailyLimit({ ALFRED_DAILY_LIMIT: '20' })).toBe(20);
    for (const bad of ['0', '-3', 'abc', '2.5', '']) expect(dailyLimit({ ALFRED_DAILY_LIMIT: bad })).toBe(50);
    expect(dailyLimit({ ALFRED_DAILY_LIMIT: '999999' })).toBe(MAX_DAILY_LIMIT);
    expect(chatConfig({})).toBeNull();
    expect(chatConfig({ OPENAI_API_KEY: KEY, ALFRED_MODEL: 'm' })).toMatchObject({ apiKey: KEY, model: 'm' });
  });
  it('o prompt do Alfred proíbe inventar dados e avisa que não há acesso a documentos', () => {
    expect(ALFRED_SYSTEM_PROMPT).toMatch(/Nunca invente/);
    expect(ALFRED_SYSTEM_PROMPT).toMatch(/não tem acesso a documentos/);
  });
});

describe('nome do modelo e diagnóstico de erro', () => {
  it('reconhece nomes de modelo válidos e recusa os mal escritos (ex.: com espaço)', () => {
    for (const ok of ['gpt-4o', 'gpt-4o-mini', 'text-embedding-3-small', 'ft:gpt-4o:org:nome:id', 'o3']) expect(isValidModelId(ok)).toBe(true);
    for (const bad of ['Alfred 1.0', 'Alfred', ' gpt-4o', 'gpt 4o', 'modelo\n', '', 'gpt-4ó', '-gpt', 'a'.repeat(101)]) expect(bad === 'Alfred' ? true : isValidModelId(bad)).toBe(bad === 'Alfred');
  });
  it('ALFRED_MODEL mal escrito desativa o chat com explicação, sem chamar a OpenAI', () => {
    const env = { OPENAI_API_KEY: KEY, ALFRED_MODEL: 'Alfred 1.0' };
    expect(chatStatus({ supabase: true, signedIn: true, env })).toEqual({ available: false, reason: 'modelo_mal_escrito' });
    expect(chatConfig(env)).toBeNull();
    expect(embeddingConfig({ OPENAI_API_KEY: KEY, ALFRED_EMBEDDING_MODEL: 'Alfred 1.0' })).toBeNull();
  });
  it('400 de modelo inválido vira modelo_invalido; outros 400 viram requisicao_recusada com detalhe', () => {
    expect(classifyProviderError(400, { message: 'invalid model ID', type: 'invalid_request_error', code: null }).kind).toBe('modelo_invalido');
    expect(classifyProviderError(400, { message: "The model `x` does not exist or you do not have access to it." }).kind).toBe('modelo_invalido');
    expect(classifyProviderError(400, { message: 'This is not a chat model and thus not supported in the v1/chat/completions endpoint.' }).kind).toBe('modelo_invalido');
    const e = classifyProviderError(400, { message: "Unsupported parameter: 'max_completion_tokens' is not supported with this model.", code: 'unsupported_parameter', param: 'max_completion_tokens', type: 'invalid_request_error' });
    expect(e.kind).toBe('requisicao_recusada');
    expect(e.detail).toBe('unsupported_parameter / max_completion_tokens / invalid_request_error');
  });
  it('o detalhe técnico nunca carrega a mensagem do provedor, a chave ou texto livre', () => {
    const e = classifyProviderError(400, { message: `erro com ${KEY}`, code: `código com espaço ${KEY}`, param: KEY + '!!', type: 'x'.repeat(200) });
    expect(e.detail).toBeNull();
    expect(JSON.stringify(e)).not.toContain(KEY);
  });
  it('o detalhe chega até o resultado do envio, sem a chave', async () => {
    const m = memory();
    const bad: AlfredModel = { complete: async () => Promise.reject(classifyProviderError(400, { code: 'unsupported_parameter', param: 'max_tokens' })) };
    const r = await sendMessage({ store: m.store, quota: m.quota, model: bad, dailyLimit: 50, now: NOW }, { conversationId: null, text: 'oi' });
    expect(r).toEqual({ ok: false, error: 'requisicao_recusada', detail: 'unsupported_parameter / max_tokens' });
  });
});
