-- ALFRED: índices e busca na base de conhecimento (semântica + palavras, combinadas por posição).

create index alfred_chunks_embedding_idx on public.alfred_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index alfred_chunks_tsv_idx on public.alfred_chunks using gin (tsv);

-- Os trechos mais relevantes para a pergunta. Combina os 24 mais próximos por significado (embedding) com os 24
-- melhores por palavras (português, com radical) pela regra de fusão por posição (RRF). Só o servidor chama.
create function public.alfred_search_chunks(p_embedding extensions.vector(1536), p_query text, p_limit integer default 8)
returns table (document_id uuid, document_name text, page integer, content text, score double precision)
language sql stable security definer set search_path = public, extensions as $$
  with sem as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as r
    from public.alfred_chunks c
    order by c.embedding <=> p_embedding
    limit 24
  ),
  kw as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q) desc, c.id) as r
    from public.alfred_chunks c, websearch_to_tsquery('portuguese', p_query) q
    where c.tsv @@ q
    order by ts_rank_cd(c.tsv, q) desc, c.id
    limit 24
  ),
  fused as (
    select coalesce(sem.id, kw.id) as id,
           coalesce(1.0 / (60 + sem.r), 0) + coalesce(1.0 / (60 + kw.r), 0) as score
    from sem full join kw on sem.id = kw.id
  )
  select d.id, d.name, c.page, c.content, f.score::double precision
  from fused f
  join public.alfred_chunks c on c.id = f.id
  join public.alfred_documents d on d.id = c.document_id
  order by f.score desc, c.id
  limit least(greatest(p_limit, 1), 20);
$$;

revoke all on function public.alfred_search_chunks(extensions.vector, text, integer) from public, anon, authenticated;
grant execute on function public.alfred_search_chunks(extensions.vector, text, integer) to service_role;
