import type { Metadata } from 'next';
import { Library } from 'lucide-react';
import { DocumentCard } from '@/components/alfred/DocumentCard';
import { DocumentUpload } from '@/components/alfred/DocumentUpload';
import { LibraryUploader } from '@/components/alfred/LibraryUploader';
import { EmptyState, PageHeader } from '@/components/alfred/states';
import { LIBRARY_UNAVAILABLE_TEXT, libraryUploadStatus } from '@/lib/alfred/config';
import { listDocuments } from '@/lib/alfred/documents';
import { getAlfredSession } from '@/lib/alfred/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';

export const metadata: Metadata = { title: 'Biblioteca' };

// Cada passo de leitura pode levar dezenas de segundos.
export const maxDuration = 60;

export default async function Page() {
  const { supabase, userId, isAdmin } = await getAlfredSession();
  const documents = supabase && userId ? await listDocuments(supabase).catch(() => null) : [];
  const upload = libraryUploadStatus({ isAdmin, hasServiceKey: Boolean(createAdminClient()) });
  const env = getSupabaseEnv();

  return (
    <div className="flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <PageHeader title="Biblioteca de conhecimento" subtitle="Documentos, metodologias e referências utilizadas pelo Alfred." />
      {upload.available && env ? <LibraryUploader supabaseUrl={env.url} supabaseKey={env.key} /> : <DocumentUpload enabled={false} disabledText={LIBRARY_UNAVAILABLE_TEXT[upload.available ? 'sem_servico' : upload.reason]} />}
      {documents === null ? (
        <EmptyState title="Não foi possível carregar a biblioteca" description="Tente de novo em instantes. Se continuar, confira se a migração da base de conhecimento foi aplicada no banco." />
      ) : documents.length === 0 ? (
        <EmptyState icon={<Library size={26} aria-hidden="true" />} title="Nenhum documento na biblioteca" description="Quando um administrador enviar PDFs, eles aparecem aqui com o andamento real da leitura: páginas lidas, falhas e trechos guardados na memória do Alfred." />
      ) : (
        <ul aria-label="Documentos" className="m-0 flex list-none flex-col gap-3 p-0">{documents.map((d) => <DocumentCard key={d.id} doc={d} canManage={upload.available} />)}</ul>
      )}
    </div>
  );
}
