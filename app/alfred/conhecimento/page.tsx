import type { Metadata } from 'next';
import { BookOpen } from 'lucide-react';
import { KnowledgeSearch } from '@/components/alfred/KnowledgeSearch';
import { EmptyState, PageHeader } from '@/components/alfred/states';
import { listConcepts } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Conhecimento' };

export default async function Page() {
  const concepts = await listConcepts();
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Base de conhecimento" subtitle="Explore os conhecimentos extraídos e organizados pelo Alfred." />
      {concepts.length === 0 ? (
        <EmptyState icon={<BookOpen size={26} aria-hidden="true" />} title="Nenhum conceito extraído ainda" description="Os conceitos aparecem aqui depois que os documentos da Biblioteca forem processados, cada um com o documento e a página de origem." note="A extração de conceitos ainda não está conectada." />
      ) : (
        <KnowledgeSearch concepts={concepts} />
      )}
    </div>
  );
}
