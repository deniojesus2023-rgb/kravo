import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Aplica as migrações de supabase/migrations num Postgres local (PGlite) e testa
 * RLS, permissões, restrições e views. O Supabase real fornece o schema `auth`
 * e os papéis; aqui eles são simulados com o mínimo necessário.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

let db: PGlite;

const n = (value: unknown) => Number(value);

async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** Executa como o navegador do usuário (papel authenticated, JWT com sub = uid). */
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

async function asRole<T>(role: 'anon' | 'service_role', fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const ids: Record<string, string> = {};

beforeAll(async () => {
  db = new PGlite();

  // Simulação mínima do que o Supabase já traz.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }

  // O service_role do Supabase recebe tudo por padrão (e ignora RLS).
  await db.exec('grant all on all tables in schema public to service_role');

  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@exemplo.com', '{"name":"Ana"}'), ($2, 'b@exemplo.com', '{}')`, [A, B]);

  // Dados do servidor (service_role/superusuário): cada usuário com oferta, pedidos e métricas.
  for (const [uid, tag] of [[A, 'a'], [B, 'b']] as const) {
    const meta = (await rows<{ id: string }>(`insert into public.meta_connections (user_id) values ($1) returning id`, [uid]))[0]!.id;
    const sales = (await rows<{ id: string }>(`insert into public.sales_connections (user_id, platform) values ($1, 'Kiwify') returning id`, [uid]))[0]!.id;
    const account = (await rows<{ id: string }>(
      `insert into public.ad_accounts (user_id, meta_connection_id, meta_account_id, name, selected) values ($1, $2, $3, 'Conta 01', true) returning id`,
      [uid, meta, `act_${tag}`],
    ))[0]!.id;
    const offer = (await rows<{ id: string }>(
      `insert into public.offers (user_id, name, code, sales_platform, price_cents, ad_account_id) values ($1, $2, 'VASOS', 'Kiwify', 14990, $3) returning id`,
      [uid, `Oferta ${tag.toUpperCase()}`, account],
    ))[0]!.id;
    const campaign = (await rows<{ id: string }>(
      `insert into public.campaigns (user_id, offer_id, ad_account_id, meta_campaign_id, name) values ($1, $2, $3, $4, 'VASOS_CBO_ESCALA') returning id`,
      [uid, offer, account, `c_${tag}`],
    ))[0]!.id;
    await db.query(`insert into public.connection_secrets (user_id, meta_connection_id, ciphertext) values ($1, $2, 'cifrado')`, [uid, meta]);
    await db.query(`insert into public.sync_runs (user_id, source, started_at) values ($1, 'Meta Ads', now())`, [uid]);
    await db.query(`insert into public.alerts (user_id, offer_id, severity, reason, recommended_action, source) values ($1, $2, 'media', 'CPA subiu', 'Revise a campanha', 'Meta Ads')`, [uid, offer]);
    await db.query(`insert into public.tracking_events (user_id, offer_id, event_name, source, event_id, occurred_at) values ($1, $2, 'purchase', 'pixel', 'e1', now())`, [uid, offer]);
    ids[`meta${tag}`] = meta;
    ids[`sales${tag}`] = sales;
    ids[`account${tag}`] = account;
    ids[`offer${tag}`] = offer;
    ids[`campaign${tag}`] = campaign;
  }

  // Pedidos de A. Três aprovados (um depois reembolsado), um pendente. Um deles no limite do fuso.
  const order = (status: string, amount: number, refunded: number, approvedAt: string | null, id: string) =>
    db.query(
      `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, refunded_cents, approved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [A, ids.offera, ids.salesa, id, status, amount, refunded, approvedAt],
    );
  await order('aprovado', 14990, 0, '2026-10-17T15:00:00-03:00', 'p1');
  await order('reembolsado', 14990, 14990, '2026-10-17T22:00:00-03:00', 'p2');
  // 23:30 em São Paulo ainda é dia 17, embora seja dia 18 em UTC.
  await order('aprovado', 14990, 0, '2026-10-17T23:30:00-03:00', 'p3');
  await order('aprovado', 14990, 0, '2026-10-18T00:30:00-03:00', 'p4');
  await order('pendente', 14990, 0, null, 'p5');
  await db.query(
    `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, approved_at)
     values ($1, $2, $3, 'p1', 'aprovado', 14990, now())`,
    [B, ids.offerb, ids.salesb],
  );

  // Métricas de A: campanha (conta) e conjunto (não deve somar de novo nas views).
  const metric = (level: string, entity: string, spend: number, purchases: number) =>
    db.query(
      `insert into public.daily_metrics (user_id, offer_id, level, entity_id, date, spend_cents, impressions, meta_purchases, meta_purchase_value_cents)
       values ($1, $2, $3, $4, '2026-10-17', $5, 1000, $6, $7)`,
      [A, ids.offera, level, entity, spend, purchases, purchases * 14990],
    );
  await metric('campaign', ids.campaigna!, 62000, 2);
  await metric('adset', ids.campaigna!, 62000, 2);
});

afterAll(async () => {
  await db.close();
});

describe('cadastro', () => {
  it('cria o perfil ao criar o usuário, com nome dos metadados', async () => {
    const profiles = await rows<{ id: string; name: string | null; timezone: string; currency: string }>(
      'select id, name, timezone, currency from public.profiles order by id',
    );
    expect(profiles).toEqual([
      { id: A, name: 'Ana', timezone: 'America/Sao_Paulo', currency: 'BRL' },
      { id: B, name: null, timezone: 'America/Sao_Paulo', currency: 'BRL' },
    ]);
  });
});

describe('isolamento por usuário (RLS)', () => {
  const TABLES = [
    'offers', 'meta_connections', 'sales_connections', 'ad_accounts', 'campaigns',
    'daily_metrics', 'orders', 'tracking_events', 'sync_runs', 'alerts', 'profiles',
  ];

  for (const table of TABLES) {
    it(`${table}: cada usuário só enxerga as próprias linhas`, async () => {
      const own = table === 'profiles' ? 'id' : 'user_id';
      const [totalAll] = await rows<{ c: string }>(`select count(*) c from public.${table}`);
      const mine = await asUser(A, () => rows<Record<string, string>>(`select ${own} from public.${table}`));
      const theirs = await asUser(B, () => rows<Record<string, string>>(`select ${own} from public.${table}`));
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r[own] === A)).toBe(true);
      expect(theirs.every((r) => r[own] === B)).toBe(true);
      expect(mine.length + theirs.length).toBe(n(totalAll!.c));
    });
  }

  it('sem login (auth.uid() nulo) nada aparece', async () => {
    const seen = await asUser('', () => rows('select id from public.offers'));
    expect(seen).toEqual([]);
  });

  it('anon não lê nem escreve nas tabelas', async () => {
    await expect(asRole('anon', () => db.query('select * from public.offers'))).rejects.toThrow(/permission denied/);
    await expect(asRole('anon', () => db.query('select * from public.offer_daily_sales'))).rejects.toThrow(/permission denied/);
  });

  it('não é possível inserir oferta em nome de outro usuário', async () => {
    await expect(
      asUser(A, () =>
        db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents) values ($1, 'Invasão', 'INVADE', 'Kiwify', 100)`, [B]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('user_id assume o usuário autenticado quando omitido', async () => {
    const [created] = await asUser(A, () =>
      rows<{ user_id: string }>(
        `insert into public.offers (name, code, sales_platform, price_cents) values ('Nova', 'NOVA1', 'Hotmart', 9900) returning user_id`,
      ),
    );
    expect(created!.user_id).toBe(A);
    await db.query(`delete from public.offers where code = 'NOVA1'`);
  });

  it('atualizar ou apagar oferta de outro usuário não afeta nenhuma linha', async () => {
    const upd = await asUser(A, () => db.query(`update public.offers set name = 'Hackeada' where id = $1`, [ids.offerb]));
    const del = await asUser(A, () => db.query(`delete from public.offers where id = $1`, [ids.offerb]));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
    const [still] = await rows<{ name: string }>('select name from public.offers where id = $1', [ids.offerb]);
    expect(still!.name).toBe('Oferta B');
  });

  it('FK composta: oferta não pode apontar para a conta de anúncios de outro usuário', async () => {
    await expect(
      asUser(A, () =>
        db.query(
          `insert into public.offers (name, code, sales_platform, price_cents, ad_account_id) values ('X', 'XX1', 'Kiwify', 1, $1)`,
          [ids.accountb],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('FK composta vale também para o servidor: pedido de A não referencia oferta de B', async () => {
    await expect(
      db.query(
        `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents)
         values ($1, $2, $3, 'z1', 'pendente', 100)`,
        [A, ids.offerb, ids.salesa],
      ),
    ).rejects.toThrow(/foreign key/);
  });
});

describe('permissões mínimas do navegador', () => {
  it('não escreve métricas, pedidos, eventos nem sincronizações', async () => {
    const attempts = [
      `insert into public.orders (offer_id, sales_connection_id, platform_order_id, status, amount_cents) values ('${ids.offera}', '${ids.salesa}', 'forjado', 'pendente', 1)`,
      `update public.orders set amount_cents = 1`,
      `delete from public.orders`,
      `update public.daily_metrics set spend_cents = 0`,
      `delete from public.tracking_events`,
      `update public.sync_runs set ok = true`,
      `update public.meta_connections set status = 'desconectado'`,
    ];
    for (const sql of attempts) {
      await expect(asUser(A, () => db.query(sql)), sql).rejects.toThrow(/permission denied/);
    }
  });

  it('vínculos e seleções: só a coluna liberada', async () => {
    await asUser(A, () => db.query(`update public.campaigns set offer_id = $1`, [ids.offera]));
    await asUser(A, () => db.query(`update public.ad_accounts set selected = false`));
    await asUser(A, () => db.query(`update public.alerts set resolved_at = now()`));
    await expect(asUser(A, () => db.query(`update public.campaigns set name = 'outro'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(A, () => db.query(`update public.alerts set reason = 'outro'`))).rejects.toThrow(/permission denied/);
    await db.exec(`update public.ad_accounts set selected = true; update public.alerts set resolved_at = null`);
  });

  it('não vincula campanha a oferta de outro usuário', async () => {
    await expect(
      asUser(A, () => db.query(`update public.campaigns set offer_id = $1`, [ids.offerb])),
    ).rejects.toThrow(/foreign key/);
  });

  it('perfil: só nome e idioma, nunca moeda ou fuso', async () => {
    await asUser(A, () => db.query(`update public.profiles set name = 'Ana Paula', locale = 'es'`));
    await expect(asUser(A, () => db.query(`update public.profiles set currency = 'BRL'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(A, () => db.query(`update public.profiles set timezone = 'UTC'`))).rejects.toThrow(/permission denied/);
    await db.query(`update public.profiles set name = 'Ana', locale = 'pt-BR' where id = $1`, [A]);
  });
});

describe('credenciais cifradas', () => {
  it('o navegador nunca lê connection_secrets, nem as próprias', async () => {
    await expect(asUser(A, () => db.query('select * from public.connection_secrets'))).rejects.toThrow(/permission denied/);
    await expect(asUser(A, () => db.query('select ciphertext from public.connection_secrets'))).rejects.toThrow(/permission denied/);
    await expect(
      asUser(A, () => db.query(`insert into public.connection_secrets (user_id, meta_connection_id, ciphertext) values ($1, $2, 'x')`, [A, ids.metaa])),
    ).rejects.toThrow(/permission denied/);
    await expect(asRole('anon', () => db.query('select * from public.connection_secrets'))).rejects.toThrow(/permission denied/);
  });

  it('o servidor (service_role) lê e escreve', async () => {
    const seen = await asRole('service_role', () => rows<{ ciphertext: string }>('select ciphertext from public.connection_secrets'));
    expect(seen).toHaveLength(2);
  });

  it('cada segredo pertence a exatamente uma conexão', async () => {
    await expect(
      db.query(`insert into public.connection_secrets (user_id, ciphertext) values ($1, 'x')`, [A]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('restrições de dados', () => {
  const insertOrder = (status: string, amount: number, refunded: number, approvedAt: string | null) =>
    db.query(
      `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, refunded_cents, approved_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [A, ids.offera, ids.salesa, `r-${Math.random()}`, status, amount, refunded, approvedAt],
    );

  it('pedido aprovado exige data de aprovação, e pendente não pode ter', async () => {
    await expect(insertOrder('aprovado', 100, 0, null)).rejects.toThrow(/check constraint/);
    await expect(insertOrder('pendente', 100, 0, '2026-10-17T10:00:00Z')).rejects.toThrow(/check constraint/);
  });

  it('reembolso não passa do valor do pedido e só existe em pedido reembolsado ou chargeback', async () => {
    await expect(insertOrder('reembolsado', 100, 101, '2026-10-17T10:00:00Z')).rejects.toThrow(/check constraint/);
    await expect(insertOrder('aprovado', 100, 50, '2026-10-17T10:00:00Z')).rejects.toThrow(/check constraint/);
  });

  it('o mesmo pedido da mesma plataforma não entra duas vezes', async () => {
    await expect(
      db.query(
        `insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents)
         values ($1, $2, $3, 'p5', 'pendente', 100)`,
        [A, ids.offera, ids.salesa],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('oferta: código no padrão, preço não negativo, status válido', async () => {
    const bad = [
      `('X', 'minusculo', 'Kiwify', 100, 'em_teste')`,
      `('X', 'OKCODE', 'Kiwify', -1, 'em_teste')`,
      `('X', 'OKCODE', 'Outra', 100, 'em_teste')`,
      `('X', 'OKCODE', 'Kiwify', 100, 'apagada')`,
      `('  ', 'OKCODE', 'Kiwify', 100, 'em_teste')`,
    ];
    for (const values of bad) {
      await expect(
        db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents, status) values ('${A}', ${values.slice(1)}`),
        values,
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('código de oferta é único por usuário, mas outro usuário pode repetir', async () => {
    await expect(
      db.query(`insert into public.offers (user_id, name, code, sales_platform, price_cents) values ($1, 'Dup', 'VASOS', 'Kiwify', 1)`, [A]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('limites de decisão por oferta aceitam objeto JSON e rejeitam outros tipos', async () => {
    await db.query(`update public.offers set decision_params = '{"scaleMinRoas": 3}' where id = $1`, [ids.offera]);
    await expect(db.query(`update public.offers set decision_params = '[1]' where id = $1`, [ids.offera])).rejects.toThrow(/check constraint/);
    await db.query(`update public.offers set decision_params = null where id = $1`, [ids.offera]);
  });

  it('updated_at é atualizado ao alterar oferta', async () => {
    const [before] = await rows<{ updated_at: Date }>('select updated_at from public.offers where id = $1', [ids.offera]);
    await db.query(`select pg_sleep(0.01)`);
    await db.query(`update public.offers set name = 'Oferta A' where id = $1`, [ids.offera]);
    const [after] = await rows<{ updated_at: Date }>('select updated_at from public.offers where id = $1', [ids.offera]);
    expect(after!.updated_at.getTime()).toBeGreaterThan(before!.updated_at.getTime());
  });
});

describe('views de totais diários', () => {
  it('vendas por dia de São Paulo, com reembolso e sem pedidos pendentes', async () => {
    const sales = await asUser(A, () =>
      rows<Record<string, unknown>>(
        `select date::text as date, approved_orders, approved_revenue_cents, refunded_cents
         from public.offer_daily_sales where offer_id = $1 order by date`,
        [ids.offera],
      ),
    );
    expect(sales.map((r) => [r.date, n(r.approved_orders), n(r.approved_revenue_cents), n(r.refunded_cents)])).toEqual([
      // p1, p2 (reembolsado) e p3 (23:30 em SP, já é 18 em UTC) caem no dia 17; p4 no dia 18.
      ['2026-10-17', 3, 44970, 14990],
      ['2026-10-18', 1, 14990, 0],
    ]);
  });

  it('métricas do Meta usam só o nível campanha, sem contar o conjunto de novo', async () => {
    const metrics = await asUser(A, () =>
      rows<Record<string, unknown>>(
        `select date::text as date, spend_cents, meta_purchases, meta_purchase_value_cents from public.offer_daily_metrics where offer_id = $1`,
        [ids.offera],
      ),
    );
    expect(metrics.map((r) => [r.date, n(r.spend_cents), n(r.meta_purchases), n(r.meta_purchase_value_cents)])).toEqual([
      ['2026-10-17', 62000, 2, 29980],
    ]);
  });

  it('as views respeitam a RLS: B não vê nada de A', async () => {
    const seen = await asUser(B, () => rows('select * from public.offer_daily_metrics'));
    expect(seen).toEqual([]);
    const sales = await asUser(B, () => rows<{ approved_orders: string }>('select approved_orders from public.offer_daily_sales'));
    expect(sales.map((r) => n(r.approved_orders))).toEqual([1]);
  });

  it('lucro e ROAS reais calculados a partir das views (exemplo de A no dia 17)', async () => {
    const [row] = await asUser(A, () =>
      rows<Record<string, unknown>>(
        `select s.approved_revenue_cents - s.refunded_cents - m.spend_cents as profit,
                s.approved_revenue_cents::float / m.spend_cents as roas_real,
                m.meta_purchase_value_cents::float / m.spend_cents as roas_meta
         from public.offer_daily_sales s join public.offer_daily_metrics m using (user_id, offer_id, date)
         where s.date = '2026-10-17'`,
      ),
    );
    // receita 44.970 − reembolsos 14.990 − gasto 62.000 (centavos)
    expect(n(row!.profit)).toBe(-32020);
    expect(n(row!.roas_real)).toBeCloseTo(44970 / 62000, 6);
    expect(n(row!.roas_meta)).toBeCloseTo(29980 / 62000, 6);
  });
});

describe('exclusão de dados (LGPD)', () => {
  it('apagar o usuário remove todos os seus dados e preserva os de outros', async () => {
    const tables = [
      'profiles', 'meta_connections', 'sales_connections', 'connection_secrets', 'ad_accounts', 'offers',
      'campaigns', 'daily_metrics', 'orders', 'tracking_events', 'sync_runs', 'alerts',
    ];
    const count = async (uid: string) => {
      const out: Record<string, number> = {};
      for (const t of tables) {
        const col = t === 'profiles' ? 'id' : 'user_id';
        out[t] = n((await rows<{ c: string }>(`select count(*) c from public.${t} where ${col} = $1`, [uid]))[0]!.c);
      }
      return out;
    };
    const beforeB = await count(B);
    expect(Object.values(await count(A)).every((c) => c > 0)).toBe(true);

    await db.query('delete from auth.users where id = $1', [A]);

    expect(Object.values(await count(A)).every((c) => c === 0)).toBe(true);
    expect(await count(B)).toEqual(beforeB);
  });
});
