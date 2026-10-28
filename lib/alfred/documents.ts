import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlfredDocument, KnowledgeCategory } from './types';

const COLUMNS = 'id, name, status, pages, processed_pages, failed_pages, empty_pages, failed_page_list, chunks, last_error, category, created_at';

type Row = { id: string; name: string; status: AlfredDocument['status']; pages: number | null; processed_pages: number; failed_pages: number; empty_pages: number; failed_page_list: number[]; chunks: number; last_error: string | null; category: string | null; created_at: string };

const toDocument = (r: Row): AlfredDocument => ({
  id: r.id,
  name: r.name,
  type: 'PDF',
  pages: r.pages,
  uploadedAt: r.created_at,
  category: r.category as KnowledgeCategory | null,
  status: r.status,
  processedPages: r.processed_pages,
  failedPages: r.failed_pages,
  emptyPages: r.empty_pages,
  failedPageList: r.failed_page_list ?? [],
  chunks: r.chunks,
  lastError: r.last_error,
});

/** Lista a biblioteca (visível a qualquer usuário logado). */
export async function listDocuments(supabase: SupabaseClient): Promise<AlfredDocument[]> {
  const { data, error } = await supabase.from('alfred_documents').select(COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error('falha ao ler documentos');
  return (data as Row[]).map(toDocument);
}

export async function getDocument(supabase: SupabaseClient, id: string): Promise<AlfredDocument | null> {
  const { data, error } = await supabase.from('alfred_documents').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('falha ao ler documento');
  return data ? toDocument(data as Row) : null;
}
