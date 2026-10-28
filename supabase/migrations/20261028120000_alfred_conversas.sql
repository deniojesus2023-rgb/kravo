-- ALFRED: conversas e mensagens do chat, mais o contador diário de uso.
-- Cada pessoa só enxerga o que é seu (RLS). O contador só é escrito pelo servidor (funções abaixo).

create table public.alfred_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.alfred_conversations (user_id, updated_at desc);

create table public.alfred_messages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null check (char_length(content) between 1 and 40000),
  created_at       timestamptz not null default now(),
  -- A mensagem só pode apontar para uma conversa do mesmo dono; apagar a conversa apaga as mensagens.
  foreign key (conversation_id, user_id) references public.alfred_conversations (id, user_id) on delete cascade
);
create index on public.alfred_messages (conversation_id, created_at);

-- Quantas mensagens a pessoa já enviou no dia (America/Sao_Paulo). Separado das mensagens de propósito:
-- apagar a conversa não zera o limite.
create table public.alfred_usage (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  messages  integer not null default 0 check (messages >= 0),
  primary key (user_id, day)
);

alter table public.alfred_conversations enable row level security;
alter table public.alfred_messages enable row level security;
alter table public.alfred_usage enable row level security;

create policy alfred_conversations_dono on public.alfred_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Mensagens: ler e criar as próprias. Sem editar nem apagar uma a uma (o histórico não é reescrito).
create policy alfred_messages_ler on public.alfred_messages for select to authenticated using (user_id = auth.uid());
create policy alfred_messages_criar on public.alfred_messages for insert to authenticated with check (user_id = auth.uid());
create policy alfred_usage_ler on public.alfred_usage for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.alfred_conversations to authenticated;
grant select, insert on public.alfred_messages to authenticated;
grant select on public.alfred_usage to authenticated;

-- Conta uma mensagem do dia. Devolve o novo total, ou nulo se o limite já foi atingido. Atômico.
create function public.alfred_consume(p_user uuid, p_day date, p_limit integer)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  if p_limit < 1 then return null; end if;
  insert into public.alfred_usage as u (user_id, day, messages) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set messages = u.messages + 1 where u.messages < p_limit
  returning u.messages into total;
  return total;
end $$;

-- Devolve a mensagem contada quando a resposta falhou (a pessoa não deve perder cota por erro do provedor).
create function public.alfred_refund(p_user uuid, p_day date)
returns void language sql security definer set search_path = public as $$
  update public.alfred_usage set messages = greatest(messages - 1, 0) where user_id = p_user and day = p_day;
$$;

-- Só o servidor (chave de serviço) chama as funções; o navegador não.
revoke all on function public.alfred_consume(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.alfred_refund(uuid, date) from public, anon, authenticated;
grant execute on function public.alfred_consume(uuid, date, integer) to service_role;
grant execute on function public.alfred_refund(uuid, date) to service_role;
