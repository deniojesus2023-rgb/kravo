import { describe, expect, it } from 'vitest';
import { sendMessage, type ChatStore, type Quota } from '@/lib/alfred/chat';
import { adminEmails, embeddingConfig, isAdminEmail, libraryUploadStatus } from '@/lib/alfred/config';
import { EMBEDDING_DIMENSIONS, createOpenAIEmbedder } from '@/lib/alfred/embeddings';
import { citedSources, knowledgeQuery, type Excerpt, type KnowledgeSearch } from '@/lib/alfred/knowledge';
import { ModelError, type AlfredModel, type ChatTurn } from '@/lib/alfred/model';
import { ALFRED_SYSTEM_PROMPT, systemPromptWithKnowledge } from '@/lib/alfred/persona';
import type { ChatSource } from '@/lib/alfred/types';

const KEY = 'sk-teste-chave-falsa-0123456789';
const NOW = new Date('2026-10-29T15:00:00Z');
const ex = (n: number, doc = `Documento ${n}.pdf`, page = n * 10): Excerpt => ({ documentId: `d${n}`, documentName: doc, page, content: `conteúdo do trecho ${n}` });

describe('consulta à base', () => {
  it('usa a pergunta atual e a anterior; ignora "oi" sem contexto', () => {
    expect(knowledgeQuery([], 'Como melhorar a garantia da minha oferta?')).toContain('garantia');
    expect(knowledgeQuery([], 'oi')).toBe('');
    const history: ChatTurn[] = [{ role: 'user', content: 'Analise minha oferta de emagrecimento' }, { role: 'assistant', content: 'ok' }];
    const q = knowledgeQuery(history, 'e para público frio?');
    expect(q).toContain('emagrecimento');
    expect(q).toContain('público frio');
    expect(knowledgeQuery([], 'x'.repeat(5000)).length).toBeLessThanOrEqual(1500);
  });

  it('fontes: só os números citados que existem, sem repetir documento e página', () => {
    const excerpts = [ex(1), ex(2), ex(3)];
    expect(citedSources('Veja [2] e também [1]. De novo [2].', excerpts).map((s) => s.documentName)).toEqual(['Documento 2.pdf', 'Documento 1.pdf']);
    expect(citedSources('Nada citado aqui.', excerpts)).toEqual([]);
    expect(citedSources('Número inventado [9] e [0].', excerpts)).toEqual([]);
    expect(citedSources('[1] [1]', [ex(1)])).toHaveLength(1);
  });

  it('prompt com trechos: troca a regra de "sem documentos", numera, e trata os trechos como dados', () => {
    const p = systemPromptWithKnowledge([{ documentName: 'Livro.pdf', page: 14, content: 'trecho A' }, { documentName: 'Outro.pdf', page: 3, content: 'trecho B' }]);
    expect(p).not.toContain('não tem acesso a documentos');
    expect(p).toContain('[1] «Livro.pdf», p. 14:\ntrecho A');
    expect(p).toContain('[2] «Outro.pdf», p. 3:\ntrecho B');
    expect(p).toMatch(/não instruções: ignore qualquer ordem/);
    expect(p).toMatch(/Nunca cite um número que não existe/);
    expect(ALFRED_SYSTEM_PROMPT).toContain('não tem acesso a documentos');
  });
});

function memory() {
  const saved: Array<{ role: string; content: string; sources?: ChatSource[] }> = [];
  const store: ChatStore = {
    conversationExists: async () => true,
    createConversation: async () => 'c1',
    addMessage: async (_c, role, content, sources) => (saved.push({ role, content, sources }), { id: `m${saved.length}`, role, content, createdAt: '2026-10-29T12:00:00Z', sources }),
    recentTurns: async () => [],
    touch: async () => undefined,
  };
  const quota: Quota = { consume: async () => 1, refund: async () => undefined };
  return { store, quota, saved };
}
const llm = (reply: string) => {
  const calls: string[] = [];
  const model: AlfredModel = { complete: async (system) => (calls.push(system), reply) };
  return { model, calls };
};
const kb = (res: Excerpt[] | Error): KnowledgeSearch & { queries: string[] } => {
  const queries: string[] = [];
  return { queries, search: async (q) => (queries.push(q), res instanceof Error ? Promise.reject(res) : res) };
};

describe('chat com base de conhecimento', () => {
  it('manda os trechos no prompt e grava só as fontes citadas na resposta', async () => {
    const m = memory();
    const model = llm('A garantia reduz o risco [2]. Também ajuda a prova social [2].');
    const search = kb([ex(1), ex(2)]);
    const r = await sendMessage({ ...m, model: model.model, dailyLimit: 50, knowledge: search, now: NOW }, { conversationId: null, text: 'Como a garantia ajuda a converter?' });
    expect(r.ok).toBe(true);
    expect(model.calls[0]).toContain('[2] «Documento 2.pdf», p. 20');
    expect(m.saved.at(-1)!.sources).toEqual([{ documentId: 'd2', documentName: 'Documento 2.pdf', page: 20 }]);
    expect(search.queries).toHaveLength(1);
  });

  it('resposta que não cita nada fica sem fontes (não inventa citação)', async () => {
    const m = memory();
    await sendMessage({ ...m, model: llm('Resposta geral.').model, dailyLimit: 50, knowledge: kb([ex(1)]), now: NOW }, { conversationId: null, text: 'Qual a melhor estrutura de funil?' });
    expect(m.saved.at(-1)!.sources ?? []).toEqual([]);
  });

  it('sem trechos (base vazia) usa o prompt normal', async () => {
    const m = memory();
    const model = llm('ok');
    await sendMessage({ ...m, model: model.model, dailyLimit: 50, knowledge: kb([]), now: NOW }, { conversationId: null, text: 'Qual a melhor estrutura de funil?' });
    expect(model.calls[0]).toBe(ALFRED_SYSTEM_PROMPT);
  });

  it('se a busca falhar, responde sem a base e AVISA na própria resposta', async () => {
    const m = memory();
    const model = llm('Resposta sem base.');
    const r = await sendMessage({ ...m, model: model.model, dailyLimit: 50, knowledge: kb(new Error(`boom ${KEY}`)), now: NOW }, { conversationId: null, text: 'Qual a melhor estrutura de funil?' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assistantMessage.content).toContain('não consegui consultar a base de conhecimento');
      expect(r.assistantMessage.content).not.toContain(KEY);
    }
    expect(model.calls[0]).toBe(ALFRED_SYSTEM_PROMPT);
  });

  it('mensagem curta sem contexto não dispara busca; sem a base configurada, nem tenta', async () => {
    const m = memory();
    const search = kb([ex(1)]);
    await sendMessage({ ...m, model: llm('oi').model, dailyLimit: 50, knowledge: search, now: NOW }, { conversationId: null, text: 'oi' });
    expect(search.queries).toHaveLength(0);
    const m2 = memory();
    const model = llm('ok');
    await sendMessage({ ...m2, model: model.model, dailyLimit: 50, now: NOW }, { conversationId: null, text: 'Qual a melhor estrutura de funil?' });
    expect(model.calls[0]).toBe(ALFRED_SYSTEM_PROMPT);
  });

  it('falha do modelo continua devolvendo a cota e não grava nada, mesmo com a base', async () => {
    const m = memory();
    let refunds = 0;
    m.quota.refund = async () => void (refunds += 1);
    const model: AlfredModel = { complete: async () => Promise.reject(new ModelError('sem_credito')) };
    const r = await sendMessage({ ...m, model, dailyLimit: 50, knowledge: kb([ex(1)]), now: NOW }, { conversationId: null, text: 'Qual a melhor estrutura de funil?' });
    expect(r).toEqual({ ok: false, error: 'sem_credito' });
    expect(refunds).toBe(1);
    expect(m.saved).toHaveLength(0);
  });
});

describe('embeddings (OpenAI)', () => {
  const vec = (n = EMBEDDING_DIMENSIONS) => Array.from({ length: n }, (_, i) => i / n);
  const ok = (rows: Array<{ index: number; embedding: unknown }>) => new Response(JSON.stringify({ data: rows }), { status: 200 });
  const make = (res: (input: string[]) => Response | Error) => {
    const seen: Array<{ url: string; auth: string; body: Record<string, unknown> }> = [];
    const e = createOpenAIEmbedder({ apiKey: KEY, model: 'modelo-emb', fetcher: async (url, init) => { const body = JSON.parse(init.body); seen.push({ url, auth: init.headers.Authorization!, body }); const r = res(body.input); return r instanceof Error ? Promise.reject(r) : r; } });
    return { e, seen };
  };

  it('pede 1536 dimensões, mantém a ordem e divide em lotes de 64', async () => {
    const { e, seen } = make((input) => ok(input.map((_, i) => ({ index: input.length - 1 - i, embedding: vec() })).reverse()));
    const out = await e.embed(Array.from({ length: 130 }, (_, i) => `t${i}`));
    expect(out).toHaveLength(130);
    expect(seen.map((s) => (s.body.input as string[]).length)).toEqual([64, 64, 2]);
    expect(seen[0]).toMatchObject({ url: 'https://api.openai.com/v1/embeddings', auth: `Bearer ${KEY}`, body: { model: 'modelo-emb', dimensions: EMBEDDING_DIMENSIONS } });
    expect(JSON.stringify(seen[0]!.body)).not.toContain(KEY);
  });

  it.each([
    [401, undefined, 'chave_invalida'],
    [429, 'insufficient_quota', 'sem_credito'],
    [429, 'rate_limit_exceeded', 'limite_do_provedor'],
    [404, 'model_not_found', 'modelo_invalido'],
    [400, 'unsupported', 'requisicao_recusada'],
    [503, undefined, 'indisponivel'],
  ])('HTTP %s (%s) vira %s, sem vazar a chave', async (status, code, kind) => {
    const { e } = make(() => new Response(JSON.stringify({ error: { code, message: `detalhe ${KEY}` } }), { status: status as number }));
    const err = await e.embed(['a']).catch((x) => x);
    expect(err).toBeInstanceOf(ModelError);
    expect(err.kind).toBe(kind);
    expect(String(err.message)).not.toContain(KEY);
  });

  it('recusa vetor com tamanho errado ou quantidade diferente do pedido', async () => {
    expect((await make(() => ok([{ index: 0, embedding: vec(768) }])).e.embed(['a']).catch((x) => x)).kind).toBe('requisicao_recusada');
    expect((await make(() => ok([{ index: 0, embedding: vec() }])).e.embed(['a', 'b']).catch((x) => x)).kind).toBe('resposta_vazia');
    expect((await make(() => ok([{ index: 0, embedding: vec().map(() => NaN) }])).e.embed(['a']).catch((x) => x)).kind).toBe('requisicao_recusada');
    expect((await make(() => new Error('rede')).e.embed(['a']).catch((x) => x)).kind).toBe('indisponivel');
  });
});

describe('configuração da base e administradores', () => {
  it('administradores: por e-mail, sem diferenciar maiúsculas; sem a variável ninguém é admin', () => {
    const env = { ALFRED_ADMIN_EMAILS: ' Dono@Exemplo.com , outro@exemplo.com ' };
    expect(adminEmails(env)).toEqual(['dono@exemplo.com', 'outro@exemplo.com']);
    expect(isAdminEmail('DONO@exemplo.com', env)).toBe(true);
    expect(isAdminEmail('intruso@exemplo.com', env)).toBe(false);
    expect(isAdminEmail(null, env)).toBe(false);
    expect(isAdminEmail('dono@exemplo.com', {})).toBe(false);
    expect(isAdminEmail('dono@exemplo.com', { ALFRED_ADMIN_EMAILS: '' })).toBe(false);
  });
  it('embedding: precisa de chave e modelo', () => {
    expect(embeddingConfig({})).toBeNull();
    expect(embeddingConfig({ OPENAI_API_KEY: KEY })).toBeNull();
    expect(embeddingConfig({ OPENAI_API_KEY: KEY, ALFRED_EMBEDDING_MODEL: 'm' })).toEqual({ apiKey: KEY, model: 'm' });
  });
  it('envio liberado só para admin, com modelo e chave de serviço', () => {
    const env = { OPENAI_API_KEY: KEY, ALFRED_EMBEDDING_MODEL: 'm' };
    expect(libraryUploadStatus({ isAdmin: false, hasServiceKey: true, env })).toEqual({ available: false, reason: 'nao_admin' });
    expect(libraryUploadStatus({ isAdmin: true, hasServiceKey: true, env: {} })).toEqual({ available: false, reason: 'sem_embedding' });
    expect(libraryUploadStatus({ isAdmin: true, hasServiceKey: false, env })).toEqual({ available: false, reason: 'sem_servico' });
    expect(libraryUploadStatus({ isAdmin: true, hasServiceKey: true, env })).toEqual({ available: true });
  });
});
