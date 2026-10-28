import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AlfredShell } from '@/components/alfred/AlfredShell';
import { capabilities, listConversations } from '@/lib/alfred/data';
import { createClient } from '@/lib/supabase/server';
import './alfred.css';

export const metadata: Metadata = {
  title: { default: 'ALFRED · Strategic Intelligence', template: 'ALFRED · %s' },
  description: 'Consultor estratégico para ofertas, criativos, campanhas e funis.',
};

export const viewport: Viewport = { themeColor: '#10141B', colorScheme: 'dark' };

export default async function AlfredLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  const conversations = capabilities.conversations ? await listConversations() : [];

  return (
    <AlfredShell sidebar={{ email, conversations, nowIso: new Date().toISOString() }} aiConnected={capabilities.chat}>
      {children}
    </AlfredShell>
  );
}
