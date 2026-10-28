import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatStore, Quota } from './chat';
import type { ChatTurn } from './model';
import type { ChatMessageData, ChatSource, Conversation } from './types';

const toSources = (raw: unknown): ChatSource[] | undefined => (Array.isArray(raw) && raw.length > 0 ? (raw as ChatSource[]) : undefined);

/** Erro de banco com o código técnico do Postgres/PostgREST (ex.: 42703 = coluna inexistente). Nunca a mensagem. */
export class StoreError extends Error {
  constructor(what: string, readonly code: string | null = null) {
    super(`falha ao ${what}`);
  }
}
const fail = (what: string, error?: { code?: unknown } | null) => new StoreError(what, typeof error?.code === 'string' && /^[A-Za-z0-9_]{3,12}$/.test(error.code) ? error.code : null);

/** Conversas do usuário logado. Usa o cliente dele: a RLS garante que só enxerga e grava o que é seu. */
export function supabaseChatStore(supabase: SupabaseClient): ChatStore {
  return {
    async conversationExists(id) {
      const { data, error } = await supabase.from('alfred_conversations').select('id').eq('id', id).maybeSingle();
      if (error) throw fail('ler conversa', error);
      return Boolean(data);
    },
    async createConversation(title) {
      const { data, error } = await supabase.from('alfred_conversations').insert({ title }).select('id').single();
      if (error || !data) throw fail('criar conversa', error);
      return data.id as string;
    },
    async addMessage(conversationId, role, content, sources) {
      const { data, error } = await supabase
        .from('alfred_messages')
        .insert({ conversation_id: conversationId, role, content, ...(sources && sources.length > 0 ? { sources } : {}) })
        .select('id, role, content, created_at, sources')
        .single();
      if (error || !data) throw fail('gravar mensagem', error);
      return { id: data.id, role: data.role, content: data.content, createdAt: data.created_at, sources: toSources(data.sources) };
    },
    async recentTurns(conversationId, limit) {
      const { data, error } = await supabase.from('alfred_messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit);
      if (error) throw fail('ler mensagens', error);
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
  const { data: rows, error: e2 } = await supabase.from('alfred_messages').select('id, role, content, created_at, sources').eq('conversation_id', id).order('created_at').limit(500);
  if (e2) throw fail('ler mensagens');
  return {
    conversation: { id: c.id, title: c.title, updatedAt: c.updated_at },
    messages: (rows ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at, sources: toSources(m.sources) })),
  };
}
