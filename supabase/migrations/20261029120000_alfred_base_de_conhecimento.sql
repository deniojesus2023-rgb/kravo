-- ALFRED: base de conhecimento compartilhada (PDFs lidos uma vez, guardados em trechos com embedding).
-- Todos os usuários logados consultam a mesma base (através do Alfred). Só o servidor grava, depois de
-- conferir que quem envia é administrador. O texto completo dos trechos NÃO é legível pelo navegador:
-- a busca é feita no servidor e devolve só os poucos trechos relevantes a cada pergunta.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.alfred_documents (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 200),
  storage_path     text not null unique,
  size_bytes       bigint not null check (size_bytes between 1 and 52428800),
  -- SHA-256 do arquivo: o mesmo PDF não entra duas vezes.
  content_hash     text unique,
  category         text check (category is null or char_length(category) <= 60),
  status           text not null default 'aguardando' check (status in ('aguardando', 'processando', 'concluido', 'parcial', 'erro')),
  pages            integer check (pages is null or pages > 0),
  -- Próxima página a ler: o processamento é feito em partes e pode ser retomado.
  next_page        integer not null default 1 check (next_page >= 1),
  processed_pages  integer not null default 0 check (processed_pages >= 0),
  failed_pages     integer not null default 0 check (failed_pages >= 0),
  -- Páginas lidas sem texto (capa, imagem, em branco). Não contam como falha.
  empty_pages      integer not null default 0 check (empty_pages >= 0),
  failed_page_list integer[] not null default '{}' check (cardinality(failed_page_list) <= 500),
  chunks           integer not null default 0 check (chunks >= 0),
  -- Código curto e fixo, nunca mensagem do provedor.
  last_error       text check (last_error is null or char_length(last_error) <= 40),
  lock_until       timestamptz,
  uploaded_by      uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.alfred_documents (created_at desc);

create table public.alfred_chunks (
  id           bigint primary key generated always as identity,
  document_id  uuid not null references public.alfred_documents (id) on delete cascade,
  page         integer not null check (page >= 1),
  chunk_index  integer not null check (chunk_index >= 0),
  content      text not null check (char_length(content) between 1 and 6000),
  embedding    extensions.vector(1536) not null,
  tsv          tsvector generated always as (to_tsvector('portuguese', content)) stored,
  -- Reprocessar a mesma página não duplica trechos.
  unique (document_id, page, chunk_index)
);

-- Cada resposta do Alfred guarda de quais trechos veio (documento e página), para mostrar as Fontes.
alter table public.alfred_messages
  add column sources jsonb check (sources is null or jsonb_typeof(sources) = 'array');

alter table public.alfred_documents enable row level security;
alter table public.alfred_chunks enable row level security;

-- Documentos: qualquer usuário logado vê a lista (nome, páginas, situação). Ninguém grava pelo navegador.
create policy alfred_documents_ler on public.alfred_documents for select to authenticated using (true);
revoke all on public.alfred_documents from anon, authenticated;
grant select on public.alfred_documents to authenticated;

-- Trechos: sem política e sem permissão para o navegador. Só o servidor lê e grava.
revoke all on public.alfred_chunks from anon, authenticated;

-- Armazenamento privado dos PDFs originais (só o servidor acessa). Ignorado onde não existe o Storage.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('alfred-documents', 'alfred-documents', false, 52428800, array['application/pdf'])
    on conflict (id) do nothing;
  end if;
end $$;
