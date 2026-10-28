'use server';

import { revalidatePath } from 'next/cache';
import { sendMessage } from '@/lib/alfred/chat';
import type { SendResult } from '@/lib/alfred/errors';
import { chatConfig } from '@/lib/alfred/config';
import { createOpenAIModel } from '@/lib/alfred/model';
import { getAlfredSession } from '@/lib/alfred/session';
import { supabaseChatStore, supabaseQuota } from '@/lib/alfred/store';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Envia uma mensagem ao Alfred. Devolve um resultado tipado (nunca lança com texto do provedor). */
export async function sendMessageAction(conversationId: string | null, text: string): Promise<SendResult> {
  if (typeof text !== 'string' || (conversationId !== null && (typeof conversationId !== 'string' || !UUID.test(conversationId)))) {
    return { ok: false, error: 'mensagem_vazia' };
  }
  const { supabase, userId, status } = await getAlfredSession();
  const config = chatConfig();
  const admin = createAdminClient();
  // Sem sessão, banco, chave ou modelo não há como responder: o campo já vem desativado, isto é só a segunda trava.
  if (!status.available || !supabase || !userId || !config || !admin) return { ok: false, error: 'indisponivel' };

  const result = await sendMessage(
    { store: supabaseChatStore(supabase), quota: supabaseQuota(admin, userId), model: createOpenAIModel({ apiKey: config.apiKey, model: config.model }), dailyLimit: config.dailyLimit },
    { conversationId, text },
  );
  // Atualiza o histórico da sidebar.
  if (result.ok) revalidatePath('/alfred', 'layout');
  return result;
}

export async function renameConversationAction(id: string, title: string): Promise<{ ok: boolean }> {
  const clean = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (typeof id !== 'string' || !UUID.test(id) || !clean) return { ok: false };
  const { supabase } = await getAlfredSession();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('alfred_conversations').update({ title: clean }).eq('id', id);
  if (error) return { ok: false };
  revalidatePath('/alfred', 'layout');
  return { ok: true };
}

export async function deleteConversationAction(id: string): Promise<{ ok: boolean }> {
  if (typeof id !== 'string' || !UUID.test(id)) return { ok: false };
  const { supabase } = await getAlfredSession();
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('alfred_conversations').delete().eq('id', id);
  if (error) return { ok: false };
  revalidatePath('/alfred', 'layout');
  return { ok: true };
}
