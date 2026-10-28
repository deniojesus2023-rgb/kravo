import type { Metadata } from 'next';
import { ChatWorkspace } from '@/components/alfred/ChatWorkspace';

export const metadata: Metadata = { title: 'Chat' };

// Sem backend de conversação, o chat não recebe `onSend`: o envio fica desativado e explicado na tela.
export default function Page() {
  return <ChatWorkspace />;
}
