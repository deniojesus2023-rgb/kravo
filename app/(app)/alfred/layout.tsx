import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { deleteConversationAction, renameConversationAction } from '@/app/(app)/alfred/actions';
import { AlfredChrome } from '@/components/alfred/AlfredChrome';
import { getAlfredSession } from '@/lib/alfred/session';
import { listConversations } from '@/lib/alfred/store';

export const metadata: Metadata = {
  title: { default: 'Alfred', template: 'Alfred · %s' },
  description: 'Consultor estratégico para ofertas, criativos, campanhas e funis.',
};

// A resposta do modelo pode levar dezenas de segundos.
export const maxDuration = 60;

export default async function AlfredLayout({ children }: { children: ReactNode }) {
  const { supabase, userId, status } = await getAlfredSession();
  // Histórico real do usuário logado. Falha de leitura não derruba a tela: o histórico só fica vazio.
  const conversations = supabase && userId ? await listConversations(supabase).catch(() => []) : [];
  const canManage = Boolean(supabase && userId);

  return (
    <AlfredChrome conversations={conversations} nowIso={new Date().toISOString()} aiConnected={status.available} onRename={canManage ? renameConversationAction : undefined} onDelete={canManage ? deleteConversationAction : undefined}>
      {children}
    </AlfredChrome>
  );
}
