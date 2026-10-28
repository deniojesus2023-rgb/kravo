import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Aplica todas as migrações reais em um PGlite. O PGlite desta versão não traz a extensão pgvector, então só as
 * linhas que dependem dela são trocadas por um substituto: `extensions.vector` vira um domínio sobre float8[],
 * `<=>` vira distância de cosseno em SQL e os índices HNSW são ignorados. Isso testa esquema, RLS, permissões e a
 * lógica da busca com vetores pequenos, mas NÃO exercita o pgvector de verdade (a migração só foi aplicada de fato
 * no Supabase, onde a extensão existe).
 */
const VECTOR_SHIM = `
  create schema if not exists extensions;
  create domain extensions.vector as float8[];
  create function extensions.cosine_distance(a float8[], b float8[]) returns float8 language sql immutable as $f$
    select 1 - coalesce(sum(x * y) / nullif(sqrt(sum(x * x)) * sqrt(sum(y * y)), 0), 0)
    from unnest(a, b) as t(x, y)
  $f$;
  create operator extensions.<=> (leftarg = float8[], rightarg = float8[], function = extensions.cosine_distance);
`;

export function adaptForPglite(sql: string): string {
  return sql
    .replace(/create extension if not exists vector with schema extensions;/g, VECTOR_SHIM)
    .replace(/extensions\.vector\(\d+\)/g, 'extensions.vector')
    .replace(/create index [^;]*using hnsw[^;]*;/g, '');
}

export async function applyMigrations(db: PGlite, dir = path.resolve(import.meta.dirname, '../../supabase/migrations')) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(adaptForPglite(readFileSync(path.join(dir, file), 'utf8')));
}
