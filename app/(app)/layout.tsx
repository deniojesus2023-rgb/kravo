import { after } from 'next/server';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LiveRefresh } from '@/components/layout/LiveRefresh';
import { DEFAULT_PERIOD, getContext, getMetaConnection, getOfferSummaries } from '@/lib/data';
import { getMetaEnv } from '@/lib/meta/config';
import { createGraph } from '@/lib/meta/graph';
import { claimRefresh, shouldRefresh } from '@/lib/meta/refresh';
import { runMetaSync } from '@/lib/meta/run';
import { supabaseRunDb } from '@/lib/meta/sync-store';
import { createAdminClient } from '@/lib/supabase/admin';
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

  // Ao abrir ou atualizar a tela com a última leitura do Meta velha, lê as métricas de hoje em segundo plano.
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  const env = getMetaEnv();
  const admin = createAdminClient();
  const stale = Boolean(userId && env && admin && shouldRefresh(connection));
  const triggered = stale && userId !== null && claimRefresh(userId, Date.now());
  if (triggered && env && admin && userId) {
    after(() => runMetaSync({ userId, graph: createGraph(env), db: supabaseRunDb(admin), mode: 'leve', minIntervalSeconds: 60 }).catch(() => undefined));
  }
  const live = connection.status === 'conectado' || connection.status === 'expirando';

  const sidebar = {
    offers: (offers ?? []).map((o) => ({
      id: o.offer.id,
      name: o.offer.name,
      roas: o.roasReal,
      action: o.decision.action,
    })),
    meta: { status: connection.status, delayMinutes: connection.lastSync?.delayMinutes ?? null, syncFailed: connection.lastSync ? !connection.lastSync.ok : false },
    isSample: context.isSample,
    user: email ? { email } : null,
  };

  return (
    <AppShell sidebar={sidebar}>
      <LiveRefresh enabled={live && !context.isSample && connection.lastSync !== null} justTriggered={triggered} />
      {children}
    </AppShell>
  );
}
