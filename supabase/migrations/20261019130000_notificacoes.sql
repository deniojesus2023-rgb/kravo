-- trakfy: notificações push (venda, Pix, resumos do dia).

-- Forma de pagamento do pedido: distingue Pix e boleto pendentes de cartão.
alter table public.orders
  add column payment_method text check (payment_method is null or payment_method in ('pix', 'boleto', 'cartao', 'outro'));

-- Aparelhos que aceitaram receber push. As chaves p256dh e auth permitem enviar a ESTE aparelho: ficam sob RLS.
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null check (endpoint like 'https://%' and length(endpoint) <= 2000),
  p256dh      text not null check (length(p256dh) between 20 and 200),
  auth        text not null check (length(auth) between 10 and 100),
  user_agent  text check (user_agent is null or length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  unique (endpoint)
);

create table public.notification_preferences (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  sale_approved     boolean not null default true,
  pix_generated     boolean not null default true,
  boleto_generated  boolean not null default true,
  refunded          boolean not null default true,
  chargeback        boolean not null default true,
  summary_morning   boolean not null default true,
  summary_afternoon boolean not null default true,
  summary_evening   boolean not null default true,
  -- Esconde valores em dinheiro no texto da notificação (aparece na tela bloqueada).
  hide_amounts      boolean not null default false,
  updated_at        timestamptz not null default now()
);

-- Fila de avisos. A chave de deduplicação garante um aviso por evento, mesmo que a leitura de vendas repita.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('venda_aprovada', 'pix_gerado', 'boleto_gerado', 'reembolso', 'chargeback', 'resumo', 'teste')),
  dedupe_key  text not null check (length(dedupe_key) <= 200),
  title       text not null,
  body        text not null,
  url         text not null default '/',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  -- Código curto e fixo, nunca a mensagem do serviço de push.
  error       text check (error is null or length(error) <= 40),
  unique (user_id, dedupe_key)
);

create index on public.notifications (user_id, created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

create policy push_subscriptions_dono on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_preferences_dono on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Histórico: o usuário só lê. Quem grava é o servidor.
create policy notifications_dono on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
