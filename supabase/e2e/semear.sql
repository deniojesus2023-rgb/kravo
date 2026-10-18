-- Semente do e2e/real.spec.ts (parte 2): números conhecidos para a oferta E2EDEMO criada pelo teste.
-- Substitua __EMAIL__ (e-mail do usuário de teste) e __OFFER_ID__ (id da oferta criada na parte 1).
-- As conexões entram como 'desconectado': o app não deve afirmar integrações que não existem.
-- Período atual (7 dias): gasto 70.010, 6 pedidos de R$ 149,90, 1 reembolsado. Anterior: gasto 35.000, 2 pedidos.
do $$
declare
  u uuid := (select id from auth.users where email = '__EMAIL__'); o uuid := '__OFFER_ID__';
  mc uuid; acc uuid; sc uuid; c uuid;
  t date := (now() at time zone 'America/Sao_Paulo')::date;
  ts timestamptz;
begin
  if u is null then raise exception 'usuário não encontrado'; end if;
  insert into public.meta_connections (user_id, status) values (u, 'desconectado') returning id into mc;
  insert into public.ad_accounts (user_id, meta_connection_id, meta_account_id, name, selected) values (u, mc, 'act_e2e', 'Conta E2E', true) returning id into acc;
  update public.offers set ad_account_id = acc where id = o and user_id = u;
  insert into public.sales_connections (user_id, platform, status) values (u, 'Kiwify', 'desconectado') returning id into sc;
  insert into public.campaigns (user_id, offer_id, ad_account_id, meta_campaign_id, name, status, daily_budget_cents)
    values (u, o, acc, 'e2e_c1', 'E2EDEMO_CBO_ESCALA', 'ativa', 20000) returning id into c;

  insert into public.daily_metrics (user_id, offer_id, level, entity_id, date, spend_cents, impressions, link_clicks, landing_page_views, checkouts_initiated, meta_purchases, meta_purchase_value_cents) values
    (u, o, 'campaign', c, t - 1, 40005, 10000, 200, 150, 30, 5, 74950),
    (u, o, 'campaign', c, t - 2, 30005, 6000, 120, 90, 18, 3, 44970),
    (u, o, 'campaign', c, t - 8, 35000, 5000, 100, 70, 10, 2, 29980);

  for i in 1..4 loop
    ts := ((t - 1)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo';
    insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, refunded_cents, approved_at, refunded_at, campaign_id)
    values (u, o, sc, 'e2e-a' || i, case when i = 4 then 'reembolsado' else 'aprovado' end, 14990,
            case when i = 4 then 14990 else 0 end, ts, case when i = 4 then ts + interval '1 day' end, c);
  end loop;
  for i in 1..2 loop
    insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, approved_at, campaign_id)
    values (u, o, sc, 'e2e-b' || i, 'aprovado', 14990, ((t - 2)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo', c),
           (u, o, sc, 'e2e-p' || i, 'aprovado', 14990, ((t - 8)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo', c);
  end loop;
end $$;
