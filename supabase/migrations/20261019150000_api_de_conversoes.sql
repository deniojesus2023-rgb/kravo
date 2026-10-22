-- trakfy: API de Conversões do Meta. Um pixel por oferta; a fila guarda só dados em hash (SHA-256), nunca em claro.

create table public.offer_pixels (
  offer_id          uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pixel_id          text not null check (pixel_id ~ '^[0-9]{8,20}$'),
  -- Desligado por padrão: ligar sem conferir a duplicidade com o pixel do checkout conta a venda em dobro.
  capi_enabled      boolean not null default false,
  -- Código do "Eventos de teste" do Gerenciador de Eventos: com ele, os eventos não entram na otimização.
  test_event_code   text check (test_event_code is null or test_event_code ~ '^[A-Za-z0-9_-]{3,40}$'),
  -- Pix e boleto gerados como AddPaymentInfo (fase posterior).
  send_pix          boolean not null default false,
  status            text not null default 'novo' check (status in ('novo', 'ok', 'token_invalido', 'erro')),
  last_ok_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (offer_id, user_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id) on delete cascade
);

-- O token da API de Conversões fica cifrado, como as demais credenciais.
alter table public.connection_secrets add column offer_id uuid;
alter table public.connection_secrets
  add foreign key (offer_id, user_id) references public.offer_pixels (offer_id, user_id) on delete cascade;
alter table public.connection_secrets drop constraint connection_secrets_check;
alter table public.connection_secrets
  add check ((meta_connection_id is not null)::int + (sales_connection_id is not null)::int + (offer_id is not null)::int = 1);
create unique index connection_secrets_offer on public.connection_secrets (offer_id) where offer_id is not null;

-- Fila e histórico de envios. `user_data` guarda só hashes SHA-256 e identificadores já anônimos.
create table public.capi_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  offer_id         uuid not null,
  platform_order_id text not null,
  event_name       text not null check (event_name in ('Purchase', 'AddPaymentInfo')),
  -- Mesmo ID no pixel do navegador e na API: o Meta deduplica por (event_name, event_id).
  event_id         text not null check (length(event_id) <= 200),
  event_time       timestamptz not null,
  value_cents      bigint not null check (value_cents >= 0),
  currency         text not null default 'BRL' check (currency = 'BRL'),
  user_data        jsonb not null default '{}'::jsonb check (jsonb_typeof(user_data) = 'object'),
  status           text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'descartado')),
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  -- Código curto e fixo, nunca a mensagem do Meta.
  last_error       text check (last_error is null or length(last_error) <= 40),
  test             boolean not null default false,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  unique (user_id, offer_id, event_name, event_id),
  foreign key (offer_id, user_id) references public.offers (id, user_id) on delete cascade
);

create index on public.capi_events (status, next_attempt_at) where status = 'pendente';
create index on public.capi_events (user_id, offer_id, created_at desc);

alter table public.offer_pixels enable row level security;
alter table public.capi_events enable row level security;

create policy offer_pixels_dono on public.offer_pixels for select to authenticated using (user_id = (select auth.uid()));
create policy capi_events_dono on public.capi_events for select to authenticated using (user_id = (select auth.uid()));

-- O navegador só lê. Quem grava (pixel, token, fila) é o servidor, depois de checar o dono.
grant select on public.offer_pixels, public.capi_events to authenticated;
