'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { embeddingConfig } from '@/lib/alfred/config';
import { createOpenAIEmbedder } from '@/lib/alfred/embeddings';
import type { IngestErrorCode, StepResult } from '@/lib/alfred/ingest';
import { processStep } from '@/lib/alfred/ingest';
import { supabaseIngestStore, supabaseStorage } from '@/lib/alfred/ingest-store';
import { getAlfredSession } from '@/lib/alfred/session';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENTS = 500;

type Denied = { ok: false; error: 'nao_autorizado' | 'arquivo_invalido' | 'envio_falhou' };

/** Só administradores (ALFRED_ADMIN_EMAILS) mexem na base. Confere sessão, e-mail e as chaves do servidor. */
async function admin() {
  const { userId, isAdmin } = await getAlfredSession();
  const client = createAdminClient();
  const embed = embeddingConfig();
  if (!userId || !isAdmin || !client || !embed) return null;
  return { userId, client, embed };
}

export async function createUploadAction(fileName: string, sizeBytes: number): Promise<{ ok: true; docId: string; path: string; token: string } | Denied> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: 'nao_autorizado' };
  const name = typeof fileName === 'string' ? fileName.replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!name || !/\.pdf$/i.test(fileName) || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) return { ok: false, error: 'arquivo_invalido' };

  const { count } = await ctx.client.from('alfred_documents').select('id', { count: 'exact', head: true });
  if ((count ?? 0) >= MAX_DOCUMENTS) return { ok: false, error: 'arquivo_invalido' };

  const docId = randomUUID();
  const path = `${docId}.pdf`;
  const { error } = await ctx.client.from('alfred_documents').insert({ id: docId, name, storage_path: path, size_bytes: sizeBytes, uploaded_by: ctx.userId });
  if (error) return { ok: false, error: 'envio_falhou' };
  const signed = await supabaseStorage(ctx.client).signedUpload(path);
  if (!signed) {
    await ctx.client.from('alfred_documents').delete().eq('id', docId);
    return { ok: false, error: 'envio_falhou' };
  }
  return { ok: true, docId, path, token: signed.token };
}

/** Lê o próximo pedaço do documento. O navegador repete até `done` (o progresso exibido vem daqui). */
export async function processStepAction(docId: string): Promise<StepResult | Denied> {
  const ctx = await admin();
  if (!ctx) return { ok: false, error: 'nao_autorizado' };
  if (typeof docId !== 'string' || !UUID.test(docId)) return { ok: false, error: 'arquivo_invalido' };
  const storage = supabaseStorage(ctx.client);
  const result = await processStep({ store: supabaseIngestStore(ctx.client), download: (p) => storage.download(p), embedder: createOpenAIEmbedder({ apiKey: ctx.embed.apiKey, model: ctx.embed.model }) }, docId);
  if (!result.ok || result.done) revalidatePath('/alfred/biblioteca');
  return result;
}

export async function deleteDocumentAction(docId: string): Promise<{ ok: boolean }> {
  const ctx = await admin();
  if (!ctx || typeof docId !== 'string' || !UUID.test(docId)) return { ok: false };
  const { data } = await ctx.client.from('alfred_documents').select('storage_path').eq('id', docId).maybeSingle();
  if (!data) return { ok: false };
  const { error } = await ctx.client.from('alfred_documents').delete().eq('id', docId);
  if (error) return { ok: false };
  await supabaseStorage(ctx.client).remove(data.storage_path).catch(() => undefined);
  revalidatePath('/alfred/biblioteca');
  return { ok: true };
}

/** Zera a leitura (trechos e contadores) para ler o PDF de novo, por exemplo depois de corrigir a configuração. */
export async function reprocessDocumentAction(docId: string): Promise<{ ok: boolean }> {
  const ctx = await admin();
  if (!ctx || typeof docId !== 'string' || !UUID.test(docId)) return { ok: false };
  const { error: e1 } = await ctx.client.from('alfred_chunks').delete().eq('document_id', docId);
  if (e1) return { ok: false };
  const { error } = await ctx.client
    .from('alfred_documents')
    .update({ status: 'aguardando', next_page: 1, processed_pages: 0, failed_pages: 0, empty_pages: 0, failed_page_list: [], chunks: 0, last_error: null, lock_until: null, updated_at: new Date().toISOString() })
    .eq('id', docId);
  if (error) return { ok: false };
  revalidatePath('/alfred/biblioteca');
  return { ok: true };
}

export type { IngestErrorCode };
