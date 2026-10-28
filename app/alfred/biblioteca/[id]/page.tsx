import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentDetail } from '@/components/alfred/DocumentDetail';
import { getDocument } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Documento' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const doc = await getDocument((await params).id);
  if (!doc) notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <DocumentDetail doc={doc} />
    </div>
  );
}
