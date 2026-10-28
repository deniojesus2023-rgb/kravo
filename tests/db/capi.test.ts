import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './harness';

/** API de Conversões no banco (migrações reais, em PGlite): isolamento, deduplicação e restrições. */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const A = '00000000-0000-4000-8000-0000000000e1';
const B = '00000000-0000-4000-8000-0000000000e2';
let db: PGlite;
let offerA: string;

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
  const o = await db.query<{ id: string }>(`insert into public.offers (user_id, name, code, sales_platform, price_cents, status) values ($1, 'Oferta A', 'OA1', 'Kiwify', 9700, 'em_teste') returning id`, [A]);
  offerA = o.rows[0]!.id;
  await db.query(`insert into public.offer_pixels (offer_id, user_id, pixel_id) values ($1, $2, '123456789')`, [offerA, A]);
  await db.query(`insert into public.capi_events (user_id, offer_id, platform_order_id, event_name, event_id, event_time, value_cents) values ($1, $2, 'p1', 'Purchase', 'p1', now(), 5000)`, [A, offerA]);
}, 60_000);

afterAll(async () => db.close());

describe('API de Conversões no banco', () => {
  it('o envio nasce desligado', async () => {
    const r = await db.query<{ capi_enabled: boolean; send_pix: boolean }>(`select capi_enabled, send_pix from public.offer_pixels`);
    expect(r.rows[0]).toEqual({ capi_enabled: false, send_pix: false });
  });
  it('cada usuário só enxerga o que é seu', async () => {
    expect((await asUser(A, () => db.query(`select 1 from public.offer_pixels`))).rows).toHaveLength(1);
    expect((await asUser(B, () => db.query(`select 1 from public.offer_pixels`))).rows).toHaveLength(0);
    expect((await asUser(B, () => db.query(`select 1 from public.capi_events`))).rows).toHaveLength(0);
  });
  it('o navegador não grava pixel nem evento', async () => {
    await expect(asUser(A, () => db.query(`update public.offer_pixels set capi_enabled = true`))).rejects.toThrow();
    await expect(asUser(A, () => db.query(`insert into public.capi_events (offer_id, platform_order_id, event_name, event_id, event_time, value_cents) values ($1, 'x', 'Purchase', 'x', now(), 1)`, [offerA]))).rejects.toThrow();
  });
  it('o mesmo evento não entra duas vezes', async () => {
    await expect(db.query(`insert into public.capi_events (user_id, offer_id, platform_order_id, event_name, event_id, event_time, value_cents) values ($1, $2, 'p1', 'Purchase', 'p1', now(), 5000)`, [A, offerA])).rejects.toThrow();
  });
  it('pixel inválido é recusado e o token precisa de um só dono', async () => {
    await expect(db.query(`update public.offer_pixels set pixel_id = 'abc'`)).rejects.toThrow();
    await expect(db.query(`insert into public.connection_secrets (user_id, ciphertext) values ($1, 'x')`, [A])).rejects.toThrow();
    await db.query(`insert into public.connection_secrets (user_id, offer_id, ciphertext) values ($1, $2, 'x')`, [A, offerA]);
    await expect(db.query(`insert into public.connection_secrets (user_id, offer_id, ciphertext) values ($1, $2, 'y')`, [A, offerA])).rejects.toThrow();
  });
  it('apagar a oferta apaga pixel, token e fila', async () => {
    await db.query(`delete from public.offers where id = $1`, [offerA]);
    for (const t of ['offer_pixels', 'capi_events', 'connection_secrets']) expect((await db.query(`select 1 from public.${t}`)).rows).toHaveLength(0);
  });
});
