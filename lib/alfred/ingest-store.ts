import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocState, IngestStore } from './ingest';
import type { Excerpt, KnowledgeSearch } from './knowledge';
import type { Embedder } from './embeddings';

export const BUCKET = 'alfred-documents';
const fail = (what: string) => new Error(`falha ao ${what}`);
const COLS = 'id, storage_path, status, pages, next_page, processed_pages, failed_pages, empty_pages, failed_page_list, chunks, content_hash';
const CHUNK_INSERT_BATCH = 100;

/** pgvector aceita o vetor como texto "[0.1,0.2,…]". */
export const toPgVector = (v: number[]) => JSON.stringify(v);

/** Leitura e gravação da base pelo cliente administrativo (a RLS não deixa o navegador gravar). */
export function supabaseIngestStore(admin: SupabaseClient): IngestStore {
  return {
    async claim(docId, lockSeconds) {
      const now = new Date();
      const until = new Date(now.getTime() + lockSeconds * 1000).toISOString();
      // Atômico: só trava se ninguém tem a trava ou se ela já venceu.
      const { data, error } = await admin
        .from('alfred_documents')
        .update({ lock_until: until, updated_at: now.toISOString() })
        .eq('id', docId)
        .or(`lock_until.is.null,lock_until.lt.${now.toISOString()}`)
        .select(COLS)
        .maybeSingle();
      if (error) throw fail('travar documento');
      if (!data) return null;
      return {
        id: data.id,
        storagePath: data.storage_path,
        status: data.status,
        pages: data.pages,
        nextPage: data.next_page,
        processedPages: data.processed_pages,
        failedPages: data.failed_pages,
        emptyPages: data.empty_pages,
        failedPageList: data.failed_page_list ?? [],
        chunks: data.chunks,
        contentHash: data.content_hash,
      } satisfies DocState;
    },
    async hashExists(hash, exceptId) {
      const { data, error } = await admin.from('alfred_documents').select('id').eq('content_hash', hash).neq('id', exceptId).limit(1);
      if (error) throw fail('conferir duplicado');
      return (data ?? []).length > 0;
    },
    async insertChunks(docId, rows) {
      for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
        const part = rows.slice(i, i + CHUNK_INSERT_BATCH).map((r) => ({ document_id: docId, page: r.page, chunk_index: r.chunkIndex, content: r.content, embedding: toPgVector(r.embedding) }));
        const { error } = await admin.from('alfred_chunks').upsert(part, { onConflict: 'document_id,page,chunk_index', ignoreDuplicates: true });
        if (error) throw fail('gravar trechos');
      }
    },
    async save(docId, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.pages !== undefined) row.pages = patch.pages;
      if (patch.nextPage !== undefined) row.next_page = patch.nextPage;
      if (patch.processedPages !== undefined) row.processed_pages = patch.processedPages;
      if (patch.failedPages !== undefined) row.failed_pages = patch.failedPages;
      if (patch.emptyPages !== undefined) row.empty_pages = patch.emptyPages;
      if (patch.failedPageList !== undefined) row.failed_page_list = patch.failedPageList;
      if (patch.chunks !== undefined) row.chunks = patch.chunks;
      if (patch.contentHash !== undefined) row.content_hash = patch.contentHash;
      if (patch.lastError !== undefined) row.last_error = patch.lastError;
      if (patch.releaseLock) row.lock_until = null;
      const { error } = await admin.from('alfred_documents').update(row).eq('id', docId);
      if (error) throw fail('salvar progresso');
    },
  };
}

/** PDFs originais: bucket privado, só o servidor (chave de serviço) acessa. */
export function supabaseStorage(admin: SupabaseClient) {
  return {
    async download(path: string): Promise<Uint8Array | null> {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async signedUpload(path: string): Promise<{ token: string } | null> {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      return error || !data ? null : { token: data.token };
    },
    async remove(path: string): Promise<void> {
      await admin.storage.from(BUCKET).remove([path]);
    },
  };
}

/** Busca na base: embedding da pergunta + função `alfred_search_chunks` (semântica + palavras). */
export function supabaseKnowledge(admin: SupabaseClient, embedder: Embedder, limit = 8): KnowledgeSearch {
  return {
    async search(query) {
      const [vector] = await embedder.embed([query]);
      if (!vector) return [];
      const { data, error } = await admin.rpc('alfred_search_chunks', { p_embedding: toPgVector(vector), p_query: query.slice(-500), p_limit: limit });
      if (error) throw fail('buscar na base');
      return ((data ?? []) as Array<{ document_id: string; document_name: string; page: number; content: string }>).map((r): Excerpt => ({ documentId: r.document_id, documentName: r.document_name, page: r.page, content: r.content }));
    },
  };
}
