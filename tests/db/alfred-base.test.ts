import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './harness';

/**
 * Base de conhecimento no banco (migrações reais em PGlite, com um substituto simples do pgvector; ver harness.ts):
 * permissões, isolamento do texto, deduplicação, exclusão em cascata e a lógica da busca. NÃO exercita o pgvector.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const A = '00000000-0000-4000-8000-0000000000c1';
const B = '00000000-0000-4000-8000-0000000000c2';
let db: PGlite;
let doc1: string;
let doc2: string;

async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const vec = (a: number, b: number, c: number) => `{${a},${b},${c}}`;
const search = (v: string, q: string, limit = 8) => asService(() => db.query<{ document_name: string; page: number; content: string; score: number }>(`select document_name, page, content, score from public.alfred_search_chunks($1::float8[], $2, $3)`, [v, q, limit]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await applyMigrations(db, MIGRATIONS);
  await db.exec('grant all on all tables in schema public to service_role; grant usage on schema extensions to service_role, authenticated;');
  await db.query(`insert into auth.users (id, email) values ($1, 'a@exemplo.com'), ($2, 'b@exemplo.com')`, [A, B]);
  doc1 = (await asService(() => db.query<{ id: string }>(`insert into public.alfred_documents (name, storage_path, size_bytes, status, pages, uploaded_by) values ('Metodologia de ofertas', 'a.pdf', 1000, 'concluido', 10, $1) returning id`, [A]))).rows[0]!.id;
  doc2 = (await asService(() => db.query<{ id: string }>(`insert into public.alfred_documents (name, storage_path, size_bytes) values ('Criativos de vídeo', 'b.pdf', 2000) returning id`))).rows[0]!.id;
  const ins = (d: string, page: number, i: number, content: string, v: string) => db.query(`insert into public.alfred_chunks (document_id, page, chunk_index, content, embedding) values ($1, $2, $3, $4, $5::float8[])`, [d, page, i, content, v]);
  await asService(async () => {
    await ins(doc1, 14, 0, 'A garantia reduz o risco percebido e aumenta a conversão da oferta.', vec(1, 0, 0));
    await ins(doc1, 15, 0, 'Prova social e depoimentos reforçam a confiança do comprador.', vec(0.8, 0.2, 0));
    await ins(doc2, 3, 0, 'O gancho dos três primeiros segundos define o hook rate do vídeo.', vec(0, 1, 0));
    await ins(doc2, 4, 0, 'Criativos em formato UGC costumam ter custo por clique menor.', vec(0, 0.9, 0.1));
  });
}, 60_000);

afterAll(async () => db.close());

describe('permissões da base', () => {
  it('qualquer usuário logado vê a lista de documentos (base compartilhada)', async () => {
    expect((await asUser(A, () => db.query(`select 1 from public.alfred_documents`))).rows).toHaveLength(2);
    expect((await asUser(B, () => db.query(`select 1 from public.alfred_documents`))).rows).toHaveLength(2);
  });
  it('o navegador não grava, altera nem apaga documentos', async () => {
    await expect(asUser(A, () => db.query(`insert into public.alfred_documents (name, storage_path, size_bytes) values ('x', 'x.pdf', 1)`))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`update public.alfred_documents set name = 'hack'`))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`delete from public.alfred_documents`))).rejects.toThrow();
  });
  it('o texto dos trechos NÃO é legível pelo navegador, nem por quem enviou o documento', async () => {
    await expect(asUser(A, () => db.query(`select content from public.alfred_chunks`))).rejects.toThrow();
    await expect(asUser(B, () => db.query(`select content from public.alfred_chunks`))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`insert into public.alfred_chunks (document_id, page, chunk_index, content, embedding) values ($1, 1, 9, 'x', '{1,0,0}'::float8[])`, [doc1]))).rejects.toThrow();
  });
  it('a busca só pode ser chamada pelo servidor', async () => {
    await expect(asUser(A, () => db.query(`select * from public.alfred_search_chunks('{1,0,0}'::float8[], 'garantia', 5)`))).rejects.toThrow();
  });
});

describe('integridade', () => {
  it('trecho repetido (mesmo documento, página e posição) é recusado', async () => {
    await expect(asService(() => db.query(`insert into public.alfred_chunks (document_id, page, chunk_index, content, embedding) values ($1, 14, 0, 'dup', '{1,0,0}'::float8[])`, [doc1]))).rejects.toThrow();
  });
  it('o mesmo conteúdo (hash) não entra duas vezes', async () => {
    await asService(() => db.query(`update public.alfred_documents set content_hash = 'abc' where id = $1`, [doc1]));
    await expect(asService(() => db.query(`update public.alfred_documents set content_hash = 'abc' where id = $1`, [doc2]))).rejects.toThrow();
  });
  it('valida situação, tamanho e página', async () => {
    await expect(asService(() => db.query(`update public.alfred_documents set status = 'pronto' where id = $1`, [doc1]))).rejects.toThrow();
    await expect(asService(() => db.query(`insert into public.alfred_documents (name, storage_path, size_bytes) values ('g', 'g.pdf', 52428801)`))).rejects.toThrow();
    await expect(asService(() => db.query(`insert into public.alfred_chunks (document_id, page, chunk_index, content, embedding) values ($1, 0, 0, 'x', '{1,0,0}'::float8[])`, [doc1]))).rejects.toThrow();
  });
  it('mensagens podem guardar as fontes (lista), e nada além disso', async () => {
    await asUser(A, () => db.query(`insert into public.alfred_conversations (title) values ('t')`));
    const conv = (await asUser(A, () => db.query<{ id: string }>(`select id from public.alfred_conversations`))).rows[0]!.id;
    await asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content, sources) values ($1, 'assistant', 'resp [1]', '[{"documentName":"x","page":1}]'::jsonb)`, [conv]));
    await expect(asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content, sources) values ($1, 'assistant', 'x', '{"a":1}'::jsonb)`, [conv]))).rejects.toThrow();
  });
});

describe('busca', () => {
  it('por significado: o vetor mais próximo vem primeiro', async () => {
    const r = await search(vec(0, 1, 0), 'zzzz sem palavras em comum');
    expect(r.rows[0]).toMatchObject({ document_name: 'Criativos de vídeo', page: 3 });
    expect(r.rows[1]).toMatchObject({ page: 4 });
  });
  it('por palavras (português, com radical): acha mesmo com vetor irrelevante', async () => {
    const r = await search(vec(0, 0, 1), 'garantias na oferta');
    expect(r.rows[0]).toMatchObject({ document_name: 'Metodologia de ofertas', page: 14 });
  });
  it('combina as duas pontas: o que aparece nas duas listas sobe', async () => {
    // Vetor perto do trecho 14 e palavras que também o encontram.
    const r = await search(vec(1, 0, 0), 'garantia reduz risco');
    expect(r.rows[0]).toMatchObject({ page: 14 });
    expect(r.rows[0]!.score).toBeGreaterThan(r.rows[1]!.score);
  });
  it('traz documento e página para citar, respeita o limite e não passa de 20', async () => {
    const r = await search(vec(1, 0, 0), 'oferta', 2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.every((x) => x.document_name && x.page > 0 && x.content)).toBe(true);
    expect((await search(vec(1, 0, 0), 'oferta', 999)).rows.length).toBeLessThanOrEqual(20);
    expect((await search(vec(1, 0, 0), 'oferta', 0)).rows).toHaveLength(1);
  });
  it('pergunta só com palavras vazias ainda devolve resultados pelo significado', async () => {
    expect((await search(vec(1, 0, 0), 'de a o')).rows.length).toBeGreaterThan(0);
  });
});

describe('exclusão', () => {
  it('apagar o documento apaga os trechos', async () => {
    await asService(() => db.query(`delete from public.alfred_documents where id = $1`, [doc2]));
    expect((await db.query(`select 1 from public.alfred_chunks where document_id = $1`, [doc2])).rows).toHaveLength(0);
    expect((await search(vec(0, 1, 0), 'vídeo')).rows.every((r) => r.document_name === 'Metodologia de ofertas')).toBe(true);
  });
});
