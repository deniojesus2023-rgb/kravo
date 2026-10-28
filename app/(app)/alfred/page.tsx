import type { Metadata } from 'next';
import { sendMessageAction } from '@/app/(app)/alfred/actions';
import { ChatWorkspace } from '@/components/alfred/ChatWorkspace';
import { unavailableText } from '@/lib/alfred/config';
import { getAlfredSession } from '@/lib/alfred/session';

export const metadata: Metadata = { title: 'Chat' };

export default async function Page() {
  const { status } = await getAlfredSession();
  return <ChatWorkspace key="nova" onSend={status.available ? sendMessageAction : undefined} disabledReason={status.available ? undefined : unavailableText(status)} />;
}
