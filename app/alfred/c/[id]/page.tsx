import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChatWorkspace } from '@/components/alfred/ChatWorkspace';
import { getConversation } from '@/lib/alfred/data';

export const metadata: Metadata = { title: 'Conversa' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const conversation = await getConversation((await params).id);
  if (!conversation) notFound();
  // As mensagens da conversa entram aqui quando o backend de conversas existir.
  return <ChatWorkspace />;
}
