-- kavro: tabelas de domínio (docs/arquitetura.md).
--
-- Convenções
-- * Toda tabela de dados tem user_id (dono) e RLS (migração seguinte).
-- * Dinheiro em centavos de BRL (bigint). Datas de métricas em America/Sao_Paulo.
-- * Texto + CHECK no lugar de enum: evoluir um conjunto de valores não exige ALTER TYPE.
-- * FKs entre tabelas do mesmo dono são compostas (id, user_id): um usuário não consegue
--   apontar para a oferta de outro, nem por UUID conhecido.
-- * Sem ON DELETE CASCADE entre tabelas de domínio. Só auth.users apaga tudo (exclusão LGPD).
--   Ofertas com dados não se apagam: arquivam-se (status 'arquivada').

-- ---------------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  locale     text not null default 'pt-BR' check (locale in ('pt-BR', 'es')),
  timezone   text not null default 'America/Sao_Paulo',
  currency   text not null default 'BRL' check (currency = 'BRL'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conexões
-- Metadados ficam nas tabelas abaixo (legíveis pelo dono). Credenciais cifradas ficam
-- em connection_secrets, sem nenhuma permissão para o navegador (só service_role).
-- ---------------------------------------------------------------------------
create table public.meta_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meta_user_id        text,
  status              text not null default 'conectado' check (status in ('conectado', 'expirando', 'desconectado')),
  granted_permissions text[] not null default '{}',
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  unique (id, user_id)
);

create table public.sales_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform       text not null check (platform in ('Hotmart', 'Kiwify', 'Eduzz', 'Shopify')),
  status         text not null default 'conectado' check (status in ('conectado', 'erro', 'desconectado')),
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (id, user_id)
);

create table public.connection_secrets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  meta_connection_id  uuid,
  sales_connection_id uuid,
  -- Cifrado pela aplicação (AES-256-GCM, chave fora do banco). Nunca em texto puro.
  ciphertext        text not null,
  created_at        timestamptz not null default now(),
  foreign key (meta_connection_id, user_id) references public.meta_connections (id, user_id) on delete cascade,
  foreign key (sales_connection_id, user_id) references public.sales_connections (id, user_id) on delete cascade,
  check ((meta_connection_id is not null)::int + (sales_connection_id is not null)::int = 1)
);

create table public.ad_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meta_connection_id uuid not null,
  meta_account_id    text not null,
  name               text not null,
  business_manager   text,
  selected           boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, meta_account_id),
  foreign key (meta_connection_id, user_id) references public.meta_connections (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Ofertas
-- ---------------------------------------------------------------------------
create table public.offers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(btrim(name)) > 0),
  -- Prefixo do padrão de nome OFERTA_ESTRUTURA_PÚBLICO.
  code             text not null check (code ~ '^[A-Z0-9]{2,12}$'),
  sales_platform   text not null check (sales_platform in ('Hotmart', 'Kiwify', 'Eduzz', 'Shopify')),
  price_cents      bigint not null check (price_cents >= 0),
  status           text not null default 'em_teste' check (status in ('em_teste', 'ativa', 'pausada', 'arquivada')),
  checkout_url     text,
  ad_account_id    uuid,
  -- Limites de decisão desta oferta (DecisionParams). Nulo = padrão do sistema.
  decision_params  jsonb check (decision_params is null or jsonb_typeof(decision_params) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, code),
  foreign key (ad_account_id, user_id) references public.ad_accounts (id, user_id)
);

create table public.pixels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ad_account_id  uuid not null,
  offer_id       uuid,
  meta_pixel_id  text not null,
  name           text,
  created_at     timestamptz not null default now(),
  unique (user_id, meta_pixel_id),
  foreign key (ad_account_id, user_id) references public.ad_accounts (id, user_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Estrutura do Meta
-- ---------------------------------------------------------------------------
create table public.creatives (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  offer_id         uuid,
  format           text not null check (format in ('video', 'imagem', 'carrossel')),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  standardized_name text not null,
  created_at       timestamptz not null default now(),
  unique (id, user_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id)
);

create table public.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Nulo enquanto a campanha não foi ligada a uma oferta (padrão de nome ou vínculo manual).
  offer_id           uuid,
  ad_account_id      uuid not null,
  meta_campaign_id   text not null,
  name               text not null,
  status             text not null default 'ativa' check (status in ('ativa', 'pausada')),
  daily_budget_cents bigint check (daily_budget_cents is null or daily_budget_cents >= 0),
  created_at         timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, meta_campaign_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id),
  foreign key (ad_account_id, user_id) references public.ad_accounts (id, user_id)
);

create table public.adsets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id    uuid not null,
  meta_adset_id  text not null,
  name           text not null,
  status         text not null default 'ativa' check (status in ('ativa', 'pausada')),
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, meta_adset_id),
  foreign key (campaign_id, user_id) references public.campaigns (id, user_id)
);

create table public.ads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  adset_id     uuid not null,
  creative_id  uuid,
  meta_ad_id   text not null,
  name         text not null,
  status       text not null default 'ativa' check (status in ('ativa', 'pausada')),
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, meta_ad_id),
  foreign key (adset_id, user_id) references public.adsets (id, user_id),
  foreign key (creative_id, user_id) references public.creatives (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Métricas do Meta (um registro por entidade e dia)
-- Os totais da oferta usam só level = 'campaign', para não contar o mesmo gasto duas vezes.
-- ---------------------------------------------------------------------------
create table public.daily_metrics (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  offer_id                  uuid not null,
  level                     text not null check (level in ('campaign', 'adset', 'ad', 'creative')),
  -- id da campanha, conjunto, anúncio ou criativo, conforme level.
  entity_id                 uuid not null,
  date                      date not null,
  spend_cents               bigint not null default 0 check (spend_cents >= 0),
  impressions               bigint not null default 0 check (impressions >= 0),
  reach                     bigint not null default 0 check (reach >= 0),
  link_clicks               bigint not null default 0 check (link_clicks >= 0),
  landing_page_views        bigint not null default 0 check (landing_page_views >= 0),
  checkouts_initiated       bigint not null default 0 check (checkouts_initiated >= 0),
  video_views_3s            bigint not null default 0 check (video_views_3s >= 0),
  -- Compras que o Meta reporta. Podem divergir dos pedidos aprovados (tabela orders).
  meta_purchases            bigint not null default 0 check (meta_purchases >= 0),
  meta_purchase_value_cents bigint not null default 0 check (meta_purchase_value_cents >= 0),
  synced_at                 timestamptz not null default now(),
  unique (user_id, level, entity_id, date),
  foreign key (offer_id, user_id) references public.offers (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Pedidos das plataformas de venda
-- Receita aprovada = pedidos que chegaram a ser aprovados (approved_at preenchido),
-- inclusive os depois reembolsados; o reembolso entra à parte em refunded_cents.
-- ---------------------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  offer_id             uuid not null,
  sales_connection_id  uuid not null,
  platform_order_id    text not null,
  status               text not null check (status in ('pendente', 'aprovado', 'reembolsado', 'chargeback', 'cancelado')),
  amount_cents         bigint not null check (amount_cents >= 0),
  refunded_cents       bigint not null default 0,
  approved_at          timestamptz,
  refunded_at          timestamptz,
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  utm_content          text,
  utm_term             text,
  -- Chave de deduplicação entre Pixel e API de Conversões.
  event_id             text,
  campaign_id          uuid,
  ad_id                uuid,
  created_at           timestamptz not null default now(),
  unique (user_id, sales_connection_id, platform_order_id),
  check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  check ((status in ('aprovado', 'reembolsado', 'chargeback')) = (approved_at is not null)),
  check (status in ('reembolsado', 'chargeback') or refunded_cents = 0),
  foreign key (offer_id, user_id) references public.offers (id, user_id),
  foreign key (sales_connection_id, user_id) references public.sales_connections (id, user_id),
  foreign key (campaign_id, user_id) references public.campaigns (id, user_id),
  foreign key (ad_id, user_id) references public.ads (id, user_id)
);

create table public.tracking_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  offer_id      uuid not null,
  event_name    text not null check (event_name in ('page_view', 'initiate_checkout', 'purchase')),
  source        text not null check (source in ('pixel', 'capi')),
  event_id      text,
  campaign_id   uuid,
  value_cents   bigint check (value_cents is null or value_cents >= 0),
  dedup_status  text not null default 'unico' check (dedup_status in ('unico', 'deduplicado', 'sem_event_id')),
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  foreign key (offer_id, user_id) references public.offers (id, user_id),
  foreign key (campaign_id, user_id) references public.campaigns (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Operação
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source        text not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  ok            boolean,
  delay_seconds integer check (delay_seconds is null or delay_seconds >= 0),
  error         text
);

create table public.alerts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  offer_id            uuid,
  severity            text not null check (severity in ('baixa', 'media', 'alta')),
  reason              text not null,
  recommended_action  text not null,
  source              text not null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now(),
  -- Todo alerta mostra a data de atualização.
  updated_at          timestamptz not null default now(),
  foreign key (offer_id, user_id) references public.offers (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index on public.offers (user_id, status);
create index on public.campaigns (user_id, offer_id);
create index on public.daily_metrics (user_id, offer_id, date);
create index on public.orders (user_id, offer_id, approved_at);
create index on public.orders (user_id, event_id) where event_id is not null;
create index on public.tracking_events (user_id, offer_id, occurred_at);
create index on public.tracking_events (user_id, event_id) where event_id is not null;
create index on public.sync_runs (user_id, source, started_at desc);
create index on public.alerts (user_id, offer_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();
create trigger alerts_touch before update on public.alerts
  for each row execute function public.touch_updated_at();

-- Todo usuário novo ganha um perfil.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', null));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
