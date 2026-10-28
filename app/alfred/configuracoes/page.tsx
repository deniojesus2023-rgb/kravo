import type { Metadata } from 'next';
import { PageHeader } from '@/components/alfred/states';
import { SettingsPanel } from '@/components/alfred/SettingsPanel';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Configurações' };

export default async function Page() {
  const supabase = await createClient();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Configurações" subtitle="Conta, preferências do Alfred, memória e privacidade." />
      <SettingsPanel email={email} />
    </div>
  );
}
