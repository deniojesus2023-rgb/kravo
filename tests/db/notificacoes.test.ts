import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './harness';

/** Notificações no banco (migrações reais, em PGlite): RLS por usuário, deduplicação e o que o navegador não pode fazer. */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const A = '00000000-0000-4000-8000-0000000000d1';
const B = '00000000-0000-4000-8000-0000000000d2';
let db: PGlite;

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

const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u', auth: 'tBHItJI5svbpez7KI4CCXg' };

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
  for (const [uid, n] of [[A, 'a'], [B, 'b']] as const) {
    await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)`, [uid, `https://push.exemplo/${n}`, KEYS.p256dh, KEYS.auth]);
    await db.query(`insert into public.notifications (user_id, kind, dedupe_key, title, body) values ($1, 'venda_aprovada', 'venda:1', 'Venda aprovada', 'Oferta')`, [uid]);
    await db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents) values ($1, 'Oferta', 'OFERTA', 'Kiwify', 1)`, [uid]);
  }
});

afterAll(async () => {
  await db.close();
});

describe('notificações: isolamento por usuário', () => {
  it('cada usuário vê só os próprios aparelhos e avisos', async () => {
    await asUser(A, async () => {
      expect((await db.query<{ endpoint: string }>('select endpoint from public.push_subscriptions')).rows.map((r) => r.endpoint)).toEqual(['https://push.exemplo/a']);
      expect((await db.query('select * from public.notifications')).rows).toHaveLength(1);
    });
  });

  it('não dá para cadastrar aparelho em nome de outro usuário, nem apagar o de outro', async () => {
    await asUser(A, async () => {
      await expect(db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x.exemplo/1', $2, $3)`, [B, KEYS.p256dh, KEYS.auth])).rejects.toThrow();
      await db.query(`delete from public.push_subscriptions where endpoint = 'https://push.exemplo/b'`);
    });
    expect(Number((await db.query<{ c: string }>(`select count(*) c from public.push_subscriptions where user_id = $1`, [B])).rows[0]!.c)).toBe(1);
  });

  it('o navegador não grava nem altera avisos: só o servidor', async () => {
    await asUser(A, async () => {
      await expect(db.query(`insert into public.notifications (user_id, kind, dedupe_key, title, body) values ($1, 'teste', 'k', 't', 'b')`, [A])).rejects.toThrow();
      await expect(db.query(`update public.notifications set title = 'forjado'`)).rejects.toThrow();
    });
  });

  it('preferências: cada usuário grava só as próprias, com padrões ligados', async () => {
    await asUser(A, async () => {
      await db.query(`insert into public.notification_preferences (user_id, hide_amounts) values ($1, true)`, [A]);
      await expect(db.query(`insert into public.notification_preferences (user_id) values ($1)`, [B])).rejects.toThrow();
      const { rows } = await db.query<{ sale_approved: boolean; hide_amounts: boolean; summary_evening: boolean }>('select * from public.notification_preferences');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ sale_approved: true, summary_evening: true, hide_amounts: true });
    });
  });
});

describe('notificações: restrições', () => {
  it('um aviso por usuário e chave: repetir não duplica', async () => {
    await expect(db.query(`insert into public.notifications (user_id, kind, dedupe_key, title, body) values ($1, 'venda_aprovada', 'venda:1', 't', 'b')`, [A])).rejects.toThrow();
    const r = await db.query(
      `insert into public.notifications (user_id, kind, dedupe_key, title, body) values ($1, 'venda_aprovada', 'venda:1', 't', 'b') on conflict (user_id, dedupe_key) do nothing returning id`,
      [A],
    );
    expect(r.rows).toHaveLength(0);
    // Outro usuário pode ter a mesma chave (cada um tem os seus pedidos).
    expect((await db.query(`select 1 from public.notifications where dedupe_key = 'venda:1'`)).rows).toHaveLength(2);
  });

  it('endpoint só HTTPS, único no sistema; tipo de aviso e forma de pagamento validados', async () => {
    await expect(db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://inseguro', $2, $3)`, [A, KEYS.p256dh, KEYS.auth])).rejects.toThrow();
    await expect(db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.exemplo/a', $2, $3)`, [B, KEYS.p256dh, KEYS.auth])).rejects.toThrow();
    await expect(db.query(`insert into public.notifications (user_id, kind, dedupe_key, title, body) values ($1, 'inventado', 'z', 't', 'b')`, [A])).rejects.toThrow();
  });

  it('forma de pagamento fora da lista é recusada em orders', async () => {
    const conn = (await db.query<{ id: string }>(`insert into public.sales_connections (user_id, platform) values ($1, 'Kiwify') returning id`, [A])).rows[0]!.id;
    const offer = (await db.query<{ id: string }>(`select id from public.offers where user_id = $1 limit 1`, [A])).rows[0]!.id;
    const ins = (method: string) =>
      db.query(`insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, payment_method) values ($1, $2, $3, $4, 'pendente', 1, $5)`, [A, offer, conn, `o-${method}`, method]);
    await ins('pix');
    await ins('boleto');
    await expect(ins('cheque')).rejects.toThrow();
  });

  it('apagar o usuário (LGPD) apaga aparelhos, preferências e avisos', async () => {
    await db.query('delete from auth.users where id = $1', [A]);
    for (const t of ['push_subscriptions', 'notifications', 'notification_preferences']) {
      expect(Number((await db.query<{ c: string }>(`select count(*) c from public.${t} where user_id = $1`, [A])).rows[0]!.c)).toBe(0);
    }
    expect(Number((await db.query<{ c: string }>(`select count(*) c from public.notifications where user_id = $1`, [B])).rows[0]!.c)).toBe(1);
  });
});
