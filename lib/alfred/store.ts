import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatStore, Quota } from './chat';
import type { ChatTurn } from './model';
import type { ChatMessageData, Conversation } from './types';

const fail = (what: string) => new Error(`falha ao ${what}`);

/** Conversas do usuário logado. Usa o cliente dele: a RLS garante que só enxerga e grava o que é seu. */
export function supabaseChatStore(supabase: SupabaseClient): ChatStore {
  return {
    async conversationExists(id) {
      const { data, error } = await supabase.from('alfred_conversations').select('id').eq('id', id).maybeSingle();
      if (error) throw fail('ler conversa');
      return Boolean(data);
    },
    async createConversation(title) {
      const { data, error } = await supabase.from('alfred_conversations').insert({ title }).select('id').single();
      if (error || !data) throw fail('criar conversa');
      return data.id as string;
    },
    async addMessage(conversationId, role, content) {
      const { data, error } = await supabase.from('alfred_messages').insert({ conversation_id: conversationId, role, content }).select('id, role, content, created_at').single();
      if (error || !data) throw fail('gravar mensagem');
      return { id: data.id, role: data.role, content: data.content, createdAt: data.created_at };
    },
    async recentTurns(conversationId, limit) {
      const { data, error } = await supabase.from('alfred_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit);
      if (error) throw fail('ler mensagens');
      return (data ?? []).reverse().map((m): ChatTurn => ({ role: m.role, content: m.content }));
    },
    async touch(conversationId) {
      await supabase.from('alfred_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    },
  };
}

/** Contador diário pelo cliente administrativo, sempre com o user_id verificado da sessão. */
export function supabaseQuota(admin: SupabaseClient, userId: string): Quota {
  return {
    async consume(day, limit) {
      const { data, error } = await admin.rpc('alfred_consume', { p_user: userId, p_day: day, p_limit: limit });
      if (error) throw fail('contar mensagem');
      return typeof data === 'number' ? data : null;
    },
    async refund(day) {
      await admin.rpc('alfred_refund', { p_user: userId, p_day: day });
    },
  };
}

export async function listConversations(supabase: SupabaseClient): Promise<Conversation[]> {
  const { data, error } = await supabase.from('alfred_conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(200);
  if (error) throw fail('ler conversas');
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

export async function getConversation(supabase: SupabaseClient, id: string): Promise<{ conversation: Conversation; messages: ChatMessageData[] } | null> {
  const { data: c, error } = await supabase.from('alfred_conversations').select('id, title, updated_at').eq('id', id).maybeSingle();
  if (error) throw fail('ler conversa');
  if (!c) return null;
  const { data: rows, error: e2 } = await supabase.from('alfred_messages').select('id, role, content, created_at').eq('conversation_id', id).order('created_at').limit(500);
  if (e2) throw fail('ler mensagens');
  return {
    conversation: { id: c.id, title: c.title, updatedAt: c.updated_at },
    messages: (rows ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
  };
}
