import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { AppShell } from '@/components/layout/AppShell';
import { getContext, getMetaConnection, getOfferSummaries, DEFAULT_PERIOD } from '@/lib/data';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'kavro', template: 'kavro · %s' },
  description: 'Cada oferta. Uma decisão.',
};

export const viewport: Viewport = {
  themeColor: '#0F1114',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [context, connection, offers] = await Promise.all([
    getContext(),
    getMetaConnection(),
    getOfferSummaries(DEFAULT_PERIOD),
  ]);

  const sidebar = {
    offers: (offers ?? []).map((o) => ({
      id: o.offer.id,
      name: o.offer.name,
      roas: o.roasReal,
      action: o.decision.action,
    })),
    meta: { status: connection.status, delayMinutes: connection.lastSync.delayMinutes },
    isSample: context.isSample,
  };

  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppShell sidebar={sidebar}>{children}</AppShell>
      </body>
    </html>
  );
}
