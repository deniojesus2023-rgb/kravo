import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocumentDetail } from '@/components/alfred/DocumentDetail';
import { getDocument } from '@/lib/alfred/documents';
import { getAlfredSession } from '@/lib/alfred/session';

export const metadata: Metadata = { title: 'Documento' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getAlfredSession();
  if (!supabase || !UUID.test(id)) notFound();
  const doc = await getDocument(supabase, id);
  if (!doc) notFound();
  return (
    <div className="flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <DocumentDetail doc={doc} />
    </div>
  );
}
