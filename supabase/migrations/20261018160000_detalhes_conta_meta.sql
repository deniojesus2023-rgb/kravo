-- kavro: dados da conexão e das contas de anúncios que a Graph API devolve.
-- A moeda importa: a kavro calcula em BRL e não converte valores de outra moeda.
alter table public.meta_connections add column meta_user_name text;

alter table public.ad_accounts
  add column currency text,
  add column timezone_name text,
  add column account_status integer;
