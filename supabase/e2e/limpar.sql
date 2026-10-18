-- Remove os dados de teste do e2e (e2e/real.spec.ts) de UM usuário, só pelos marcadores do teste:
-- oferta com código E2EDEMO, conta de anúncios act_e2e e pedidos e2e-*. Não apaga o usuário.
-- Substitua __EMAIL__ pelo e-mail do usuário de teste antes de executar.
do $$
declare
  u uuid := (select id from auth.users where email = '__EMAIL__');
  sales_ids uuid[];
begin
  if u is null then raise exception 'usuário não encontrado'; end if;

  select array_agg(distinct sales_connection_id) into sales_ids
    from public.orders where user_id = u and platform_order_id like 'e2e-%';

  delete from public.orders where user_id = u and platform_order_id like 'e2e-%';
  delete from public.daily_metrics where user_id = u
    and entity_id in (select id from public.campaigns where user_id = u and meta_campaign_id = 'e2e_c1');
  delete from public.campaigns where user_id = u and meta_campaign_id = 'e2e_c1';
  delete from public.offers where user_id = u and code = 'E2EDEMO';

  delete from public.sales_connections where user_id = u and id = any (coalesce(sales_ids, '{}'));
  delete from public.ad_accounts where user_id = u and meta_account_id = 'act_e2e';
  delete from public.meta_connections m where m.user_id = u
    and not exists (select 1 from public.ad_accounts a where a.meta_connection_id = m.id)
    and m.status = 'desconectado' and m.meta_user_id is null;
end $$;
