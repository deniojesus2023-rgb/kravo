import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfferHeader } from '@/components/offer/OfferHeader';
import { UnderConstruction } from '@/components/ui/PageStates';
import { getContext, getOffer } from '@/lib/data';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offer = await getOffer((await params).id);
  return { title: offer ? `Rastreamento · ${offer.name}` : 'Oferta não encontrada' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const offer = await getOffer((await params).id);
  if (!offer) notFound();
  const context = await getContext();
  return (
    <>
      <OfferHeader offer={offer} current="/rastreamento" isSample={context.isSample} />
      <UnderConstruction title="Rastreamento" />
    </>
  );
}
