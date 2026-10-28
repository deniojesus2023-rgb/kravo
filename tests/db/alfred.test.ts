import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './harness';

/** Alfred no banco (migrações reais, em PGlite): isolamento, histórico, apagar conversa e contador diário. */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const A = '00000000-0000-4000-8000-0000000000f1';
const B = '00000000-0000-4000-8000-0000000000f2';
let db: PGlite;
let convA: string;

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
  await db.exec('grant all on all tables in schema public to service_role');
  await db.query(`insert into auth.users (id, email) values ($1, 'a@exemplo.com'), ($2, 'b@exemplo.com')`, [A, B]);
  convA = (await asUser(A, () => db.query<{ id: string }>(`insert into public.alfred_conversations (title) values ('Oferta low ticket') returning id`))).rows[0]!.id;
  await asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content) values ($1, 'user', 'oi'), ($1, 'assistant', 'olá')`, [convA]));
}, 60_000);

afterAll(async () => db.close());

describe('conversas e mensagens', () => {
  it('cada pessoa só enxerga as próprias', async () => {
    expect((await asUser(A, () => db.query(`select 1 from public.alfred_conversations`))).rows).toHaveLength(1);
    expect((await asUser(A, () => db.query(`select 1 from public.alfred_messages`))).rows).toHaveLength(2);
    expect((await asUser(B, () => db.query(`select 1 from public.alfred_conversations`))).rows).toHaveLength(0);
    expect((await asUser(B, () => db.query(`select 1 from public.alfred_messages`))).rows).toHaveLength(0);
  });
  it('outra pessoa não escreve na minha conversa nem a altera ou apaga', async () => {
    await expect(asUser(B, () => db.query(`insert into public.alfred_messages (conversation_id, role, content) values ($1, 'user', 'intruso')`, [convA]))).rejects.toThrow();
    expect((await asUser(B, () => db.query(`update public.alfred_conversations set title = 'x' where id = $1`, [convA]))).affectedRows).toBe(0);
    expect((await asUser(B, () => db.query(`delete from public.alfred_conversations where id = $1`, [convA]))).affectedRows).toBe(0);
  });
  it('não dá para gravar mensagem em nome de outro usuário', async () => {
    await expect(asUser(A, () => db.query(`insert into public.alfred_messages (user_id, conversation_id, role, content) values ($1, $2, 'user', 'x')`, [B, convA]))).rejects.toThrow();
  });
  it('o histórico não é reescrito: sem editar nem apagar mensagens uma a uma', async () => {
    await expect(asUser(A, () => db.query(`update public.alfred_messages set content = 'outra' where conversation_id = $1`, [convA]))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`delete from public.alfred_messages where conversation_id = $1`, [convA]))).rejects.toThrow();
  });
  it('papel e tamanho são validados', async () => {
    await expect(asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content) values ($1, 'system', 'x')`, [convA]))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content) values ($1, 'user', '')`, [convA]))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`insert into public.alfred_conversations (title) values ('')`))).rejects.toThrow();
  });
  it('renomear funciona; apagar a conversa apaga as mensagens', async () => {
    await asUser(A, () => db.query(`update public.alfred_conversations set title = 'Novo título' where id = $1`, [convA]));
    expect((await asUser(A, () => db.query<{ title: string }>(`select title from public.alfred_conversations`))).rows[0]!.title).toBe('Novo título');
    const extra = (await asUser(A, () => db.query<{ id: string }>(`insert into public.alfred_conversations (title) values ('Descartável') returning id`))).rows[0]!.id;
    await asUser(A, () => db.query(`insert into public.alfred_messages (conversation_id, role, content) values ($1, 'user', 'x')`, [extra]));
    await asUser(A, () => db.query(`delete from public.alfred_conversations where id = $1`, [extra]));
    expect((await db.query(`select 1 from public.alfred_messages where conversation_id = $1`, [extra])).rows).toHaveLength(0);
  });
});

describe('contador diário', () => {
  const consume = (user: string, day: string, limit: number) => asService(() => db.query<{ r: number | null }>(`select public.alfred_consume($1, $2, $3) as r`, [user, day, limit])).then((x) => x.rows[0]!.r);

  it('conta até o limite e depois devolve nulo, sem passar dele', async () => {
    expect(await consume(A, '2026-10-28', 3)).toBe(1);
    expect(await consume(A, '2026-10-28', 3)).toBe(2);
    expect(await consume(A, '2026-10-28', 3)).toBe(3);
    expect(await consume(A, '2026-10-28', 3)).toBeNull();
    expect(await consume(A, '2026-10-28', 3)).toBeNull();
    expect((await db.query<{ messages: number }>(`select messages from public.alfred_usage where user_id = $1 and day = '2026-10-28'`, [A])).rows[0]!.messages).toBe(3);
  });
  it('é por pessoa e por dia', async () => {
    expect(await consume(B, '2026-10-28', 3)).toBe(1);
    expect(await consume(A, '2026-10-29', 3)).toBe(1);
  });
  it('limite inválido nunca conta', async () => {
    expect(await consume(B, '2026-11-01', 0)).toBeNull();
    expect(await consume(B, '2026-11-01', -5)).toBeNull();
  });
  it('devolver a cota reduz o total e nunca fica negativo', async () => {
    await asService(() => db.query(`select public.alfred_refund($1, '2026-10-28')`, [A]));
    expect(await consume(A, '2026-10-28', 3)).toBe(3);
    for (let i = 0; i < 5; i += 1) await asService(() => db.query(`select public.alfred_refund($1, '2026-12-25')`, [A]));
    expect((await db.query(`select 1 from public.alfred_usage where user_id = $1 and day = '2026-12-25'`, [A])).rows).toHaveLength(0);
  });
  it('apagar conversas não zera o limite', async () => {
    await asUser(A, () => db.query(`delete from public.alfred_conversations`));
    expect(await consume(A, '2026-10-28', 3)).toBeNull();
  });
  it('o navegador não chama as funções nem escreve no contador', async () => {
    await expect(asUser(A, () => db.query(`select public.alfred_consume($1, '2026-10-30', 100)`, [A]))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`select public.alfred_refund($1, '2026-10-28')`, [A]))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`update public.alfred_usage set messages = 0`))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`insert into public.alfred_usage (user_id, day, messages) values ($1, '2026-10-31', 0)`, [A]))).rejects.toThrow();
    // Só lê o próprio.
    expect((await asUser(B, () => db.query(`select user_id from public.alfred_usage`))).rows.every((r) => (r as { user_id: string }).user_id === B)).toBe(true);
  });
});
