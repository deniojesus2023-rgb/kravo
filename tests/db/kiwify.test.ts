import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyMigrations } from './harness';
import type { KiwifySale } from '@/lib/kiwify/client';
import { mapSale } from '@/lib/kiwify/orders';

/** As regras do banco (migrações reais, em PGlite) aceitam tudo o que `mapSale` produz e a gravação repetida não duplica. */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const U = '00000000-0000-4000-8000-0000000000c1';
let db: PGlite;
let offer: string;
let conn: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  await applyMigrations(db, MIGRATIONS);
  await db.query(`insert into auth.users (id, email) values ($1, 'k@exemplo.com')`, [U]);
  conn = (await db.query<{ id: string }>(`insert into public.sales_connections (user_id, platform) values ($1, 'Kiwify') returning id`, [U])).rows[0]!.id;
  offer = (await db.query<{ id: string }>(`insert into public.offers (user_id, name, code, sales_platform, price_cents, sales_product_id) values ($1, 'Vasos', 'VASOS', 'Kiwify', 14990, 'prod-vasos') returning id`, [U])).rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

const base: KiwifySale = {
  id: 'x',
  created_at: '2026-10-17T15:00:00.000Z',
  updated_at: '2026-10-17T15:05:00.000Z',
  approved_date: '2026-10-17T15:01:00.000Z',
  refunded_at: null,
  product: { id: 'prod-vasos' },
  payment: { charge_amount: 14990, charge_currency: 'BRL' },
};

const upsert = async (s: KiwifySale) => {
  const r = mapSale(s);
  if (!r.ok) throw new Error(r.reason);
  const o = r.order;
  await db.query(
    `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, refunded_cents, approved_at, refunded_at, utm_campaign)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, sales_connection_id, platform_order_id) do update set
       status = excluded.status, amount_cents = excluded.amount_cents, refunded_cents = excluded.refunded_cents,
       approved_at = excluded.approved_at, refunded_at = excluded.refunded_at, utm_campaign = excluded.utm_campaign`,
    [U, offer, conn, o.platformOrderId, o.status, o.amountCents, o.refundedCents, o.approvedAt, o.refundedAt, o.utm.campaign],
  );
};

describe('pedidos da Kiwify no banco', () => {
  it('todo status mapeado satisfaz as restrições da tabela orders', async () => {
    const statuses: Array<[string, Partial<KiwifySale>]> = [
      ['paid', {}],
      ['approved', {}],
      ['refund_requested', {}],
      ['pending_refund', {}],
      ['refunded', { refunded_at: '2026-10-18T10:00:00.000Z' }],
      ['chargedback', {}],
      ['waiting_payment', { approved_date: null }],
      ['pending', { approved_date: null }],
      ['processing', { approved_date: null }],
      ['authorized', { approved_date: null }],
      ['refused', { approved_date: null }],
      ['paid', { approved_date: null }],
      ['refunded', { approved_date: null }],
    ];
    for (const [i, [status, over]] of statuses.entries()) await upsert({ ...base, ...over, id: `s${i}`, status });
    const { rows } = await db.query<{ c: string }>(`select count(*) c from public.orders where user_id = $1`, [U]);
    expect(Number(rows[0]!.c)).toBe(statuses.length);
  });

  it('gravar de novo (mesmo pedido) atualiza em vez de duplicar', async () => {
    await upsert({ ...base, id: 'dup', status: 'paid' });
    await upsert({ ...base, id: 'dup', status: 'refunded', refunded_at: '2026-10-19T10:00:00.000Z' });
    const { rows } = await db.query<{ status: string; refunded_cents: string }>(`select status, refunded_cents from public.orders where platform_order_id = 'dup'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('reembolsado');
    expect(Number(rows[0]!.refunded_cents)).toBe(14990);
  });

  it('um produto só pode estar ligado a uma oferta; o mesmo produto em outra plataforma não conflita', async () => {
    await expect(db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents, sales_product_id) values ($1, 'Outra', 'OUTRA', 'Kiwify', 1, 'prod-vasos')`, [U])).rejects.toThrow();
    await db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents, sales_product_id) values ($1, 'Hot', 'HOT', 'Hotmart', 1, 'prod-vasos')`, [U]);
  });

  it('id de produto fora do formato é recusado; uma conexão por plataforma e usuário', async () => {
    await expect(db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents, sales_product_id) values ($1, 'Ruim', 'RUIM', 'Eduzz', 1, 'a b')`, [U])).rejects.toThrow();
    await expect(db.query(`insert into public.sales_connections (user_id, platform) values ($1, 'Kiwify')`, [U])).rejects.toThrow();
  });

  it('o hash do webhook é único', async () => {
    await db.query(`update public.sales_connections set webhook_secret_hash = 'h1' where id = $1`, [conn]);
    await db.query(`insert into public.sales_connections (user_id, platform, webhook_secret_hash) values ($1, 'Hotmart', null)`, [U]);
    await expect(db.query(`insert into public.sales_connections (user_id, platform, webhook_secret_hash) values ($1, 'Eduzz', 'h1')`, [U])).rejects.toThrow();
  });

  it('modo da conexão: padrão api, só api ou webhook; amostra do aviso e produtos vistos têm formato validado', async () => {
    expect((await db.query<{ mode: string; webhook_products: unknown }>(`select mode, webhook_products from public.sales_connections where id = $1`, [conn])).rows[0]).toMatchObject({ mode: 'api', webhook_products: {} });
    await db.query(`update public.sales_connections set mode = 'webhook', last_webhook_at = now(), last_webhook_sample = '{"event":"order_approved"}', webhook_products = '{"prod-1":"Vasos"}' where id = $1`, [conn]);
    await expect(db.query(`update public.sales_connections set mode = 'outro' where id = $1`, [conn])).rejects.toThrow();
    await expect(db.query(`update public.sales_connections set last_webhook_sample = '[1,2]' where id = $1`, [conn])).rejects.toThrow();
    await expect(db.query(`update public.sales_connections set webhook_products = '[]' where id = $1`, [conn])).rejects.toThrow();
    await db.query(`update public.sales_connections set mode = 'api' where id = $1`, [conn]);
  });

  it('as views de venda enxergam o pedido aprovado e o reembolso da Kiwify', async () => {
    const { rows } = await db.query<{ approved_orders: string; approved_revenue_cents: string; refunded_cents: string }>(
      `select sum(approved_orders) approved_orders, sum(approved_revenue_cents) approved_revenue_cents, sum(refunded_cents) refunded_cents from public.offer_daily_sales where offer_id = $1`,
      [offer],
    );
    expect(Number(rows[0]!.approved_orders)).toBeGreaterThan(0);
    expect(Number(rows[0]!.approved_revenue_cents)).toBeGreaterThan(0);
    expect(Number(rows[0]!.refunded_cents)).toBeGreaterThan(0);
  });
});
