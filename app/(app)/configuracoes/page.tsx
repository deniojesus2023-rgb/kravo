import type { Metadata } from 'next';
import { UnderConstruction } from '@/components/ui/PageStates';

export const metadata: Metadata = { title: 'Configurações' };

export default function Page() {
  return (
    <>
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Configurações</h1>
      <UnderConstruction title="Configurações" />
    </>
  );
}
