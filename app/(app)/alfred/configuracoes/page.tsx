import type { Metadata } from 'next';
import { PageHeader } from '@/components/alfred/states';
import { SettingsPanel } from '@/components/alfred/SettingsPanel';
import { embeddingStatus } from '@/lib/alfred/config';
import { getAlfredSession } from '@/lib/alfred/session';

export const metadata: Metadata = { title: 'Configurações' };

export default async function Page() {
  const { email, status, isAdmin } = await getAlfredSession();
  return (
    <div className="flex w-full max-w-[1040px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <PageHeader title="Configurações" subtitle="Conta, preferências do Alfred, memória e privacidade." />
      <SettingsPanel email={email} chat={status} library={{ embedding: embeddingStatus(), isAdmin }} />
    </div>
  );
}
