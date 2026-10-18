import type { Metadata } from 'next';
import { UnderConstruction } from '@/components/ui/PageStates';

export const metadata: Metadata = { title: 'Integrações' };

export default function Page() {
  return (
    <>
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Integrações</h1>
      <UnderConstruction title="Integrações" />
    </>
  );
}
