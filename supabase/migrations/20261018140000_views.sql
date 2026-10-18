-- kavro: totais diários por oferta.
--
-- security_invoker: a view roda com as permissões e a RLS de quem consulta,
-- então cada usuário só soma as próprias linhas.

-- Meta, por oferta e dia. Só nível campanha, para não contar o gasto mais de uma vez.
create view public.offer_daily_metrics with (security_invoker = true) as
select
  user_id,
  offer_id,
  date,
  sum(spend_cents)::bigint                as spend_cents,
  sum(impressions)::bigint                as impressions,
  sum(link_clicks)::bigint                as link_clicks,
  sum(landing_page_views)::bigint         as landing_page_views,
  sum(checkouts_initiated)::bigint        as checkouts_initiated,
  sum(meta_purchases)::bigint             as meta_purchases,
  sum(meta_purchase_value_cents)::bigint  as meta_purchase_value_cents
from public.daily_metrics
where level = 'campaign'
group by user_id, offer_id, date;

-- Plataformas de venda, por oferta e dia de aprovação em America/Sao_Paulo.
-- Receita aprovada inclui pedidos depois reembolsados; o reembolso é subtraído à parte.
-- Reembolso e chargeback entram no dia da aprovação do pedido (coorte), não no dia do estorno.
create view public.offer_daily_sales with (security_invoker = true) as
select
  user_id,
  offer_id,
  (approved_at at time zone 'America/Sao_Paulo')::date as date,
  count(*)::bigint                 as approved_orders,
  sum(amount_cents)::bigint        as approved_revenue_cents,
  sum(refunded_cents)::bigint      as refunded_cents
from public.orders
where approved_at is not null
group by user_id, offer_id, (approved_at at time zone 'America/Sao_Paulo')::date;

grant select on public.offer_daily_metrics, public.offer_daily_sales to authenticated;
