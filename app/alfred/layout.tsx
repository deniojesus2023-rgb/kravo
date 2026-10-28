import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { deleteConversationAction, renameConversationAction } from '@/app/alfred/actions';
import { AlfredShell } from '@/components/alfred/AlfredShell';
import { getAlfredSession } from '@/lib/alfred/session';
import { listConversations } from '@/lib/alfred/store';
import './alfred.css';

export const metadata: Metadata = {
  title: { default: 'ALFRED · Strategic Intelligence', template: 'ALFRED · %s' },
  description: 'Consultor estratégico para ofertas, criativos, campanhas e funis.',
};

export const viewport: Viewport = { themeColor: '#10141B', colorScheme: 'dark' };

// A resposta do modelo pode levar dezenas de segundos.
export const maxDuration = 60;

export default async function AlfredLayout({ children }: { children: ReactNode }) {
  const { supabase, userId, email, status } = await getAlfredSession();
  // Histórico real do usuário logado. Falha de leitura não derruba a tela: a sidebar só fica sem histórico.
  const conversations = supabase && userId ? await listConversations(supabase).catch(() => []) : [];
  const canManage = Boolean(supabase && userId);

  return (
    <AlfredShell sidebar={{ email, conversations, nowIso: new Date().toISOString(), onRename: canManage ? renameConversationAction : undefined, onDelete: canManage ? deleteConversationAction : undefined }} aiConnected={status.available}>
      {children}
    </AlfredShell>
  );
}
