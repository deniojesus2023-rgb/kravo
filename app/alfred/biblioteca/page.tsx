import type { Metadata } from 'next';
import { Library, Plus } from 'lucide-react';
import { DocumentCard } from '@/components/alfred/DocumentCard';
import { DocumentUpload } from '@/components/alfred/DocumentUpload';
import { EmptyState, GoldButton, PageHeader } from '@/components/alfred/states';
import { capabilities, listDocuments } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Biblioteca' };

export default async function Page() {
  const documents = await listDocuments();
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Biblioteca de conhecimento" subtitle="Documentos, metodologias e referências utilizadas pelo Alfred." action={<GoldButton disabled={!capabilities.documents} reason="O processamento de documentos ainda não está conectado."><Plus size={16} aria-hidden="true" />Adicionar documentos</GoldButton>} />
      <DocumentUpload enabled={capabilities.documents} />
      {documents.length === 0 ? (
        <EmptyState icon={<Library size={26} aria-hidden="true" />} title="Nenhum documento na biblioteca" description="Quando você enviar PDFs, eles aparecem aqui com o andamento real do processamento: páginas lidas, falhas e conceitos extraídos." />
      ) : (
        <ul aria-label="Documentos" className="m-0 flex list-none flex-col gap-3 p-0">{documents.map((d) => <DocumentCard key={d.id} doc={d} />)}</ul>
      )}
    </div>
  );
}
