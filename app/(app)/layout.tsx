import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DEFAULT_PERIOD, getContext, getMetaConnection, getOfferSummaries } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [context, connection, offers, supabase] = await Promise.all([
    getContext(),
    getMetaConnection(),
    getOfferSummaries(DEFAULT_PERIOD),
    createClient(),
  ]);

  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;

  const sidebar = {
    offers: (offers ?? []).map((o) => ({
      id: o.offer.id,
      name: o.offer.name,
      roas: o.roasReal,
      action: o.decision.action,
    })),
    meta: { status: connection.status, delayMinutes: connection.lastSync?.delayMinutes ?? null },
    isSample: context.isSample,
    user: email ? { email } : null,
  };

  return <AppShell sidebar={sidebar}>{children}</AppShell>;
}
