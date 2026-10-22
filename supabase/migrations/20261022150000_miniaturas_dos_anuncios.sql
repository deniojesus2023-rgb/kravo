-- trakfy: miniatura, formato e duração do criativo de cada anúncio (lidos do Meta com ads_read).
-- A URL da miniatura é um link assinado da CDN do Meta e expira: é renovada a cada leitura completa.
alter table public.ads
  add column format           text check (format is null or format in ('video', 'imagem')),
  add column thumbnail_url    text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  add column duration_seconds integer check (duration_seconds is null or duration_seconds > 0);
