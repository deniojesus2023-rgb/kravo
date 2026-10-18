-- kavro: vendas aprovadas por campanha e dia (atribuição por UTM → orders.campaign_id).
-- security_invoker: respeita a RLS de quem consulta.
create view public.campaign_daily_sales with (security_invoker = true) as
select
  user_id,
  offer_id,
  campaign_id,
  (approved_at at time zone 'America/Sao_Paulo')::date as date,
  count(*)::bigint            as approved_orders,
  sum(amount_cents)::bigint   as approved_revenue_cents
from public.orders
where approved_at is not null and campaign_id is not null
group by user_id, offer_id, campaign_id, (approved_at at time zone 'America/Sao_Paulo')::date;

grant select on public.campaign_daily_sales to authenticated;
