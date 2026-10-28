import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sendMessageAction } from '@/app/(app)/alfred/actions';
import { ChatWorkspace } from '@/components/alfred/ChatWorkspace';
import { unavailableText } from '@/lib/alfred/config';
import { getAlfredSession } from '@/lib/alfred/session';
import { getConversation } from '@/lib/alfred/store';

export const metadata: Metadata = { title: 'Conversa' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, status } = await getAlfredSession();
  // Sem banco ou sem sessão não há conversa para abrir; um id de outra pessoa não passa pela RLS.
  if (!supabase || !UUID.test(id)) notFound();
  const found = await getConversation(supabase, id);
  if (!found) notFound();
  return <ChatWorkspace key={id} conversationId={id} initialMessages={found.messages} onSend={status.available ? sendMessageAction : undefined} disabledReason={status.available ? undefined : unavailableText(status)} />;
}
