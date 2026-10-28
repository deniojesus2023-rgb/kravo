import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConceptDetail } from '@/components/alfred/ConceptDetail';
import { getConcept } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Conceito' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const concept = await getConcept((await params).id);
  if (!concept) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <ConceptDetail concept={concept} />
    </div>
  );
}
