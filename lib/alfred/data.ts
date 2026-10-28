import type { AlfredCapabilities, AlfredDocument, Concept, Conversation, Project } from './types';

/**
 * Camada de dados do Alfred. Ainda não há backend (modelo de IA, processamento de PDFs, base de conhecimento,
 * projetos): tudo devolve vazio e nenhum recurso é declarado como disponível. Para conectar, troque o corpo
 * destas funções (por exemplo, leituras no Supabase com a RLS do usuário) e ligue a capacidade correspondente.
 */

export const capabilities: AlfredCapabilities = {
  chat: false,
  conversations: false,
  attachments: false,
  documents: false,
  knowledge: false,
  projects: false,
  preferences: false,
};

export async function listConversations(): Promise<Conversation[]> {
  return [];
}

export async function getConversation(_id: string): Promise<Conversation | null> {
  return null;
}

export async function listDocuments(): Promise<AlfredDocument[]> {
  return [];
}

export async function getDocument(_id: string): Promise<AlfredDocument | null> {
  return null;
}

export async function listConcepts(): Promise<Concept[]> {
  return [];
}

export async function getConcept(_id: string): Promise<Concept | null> {
  return null;
}

export async function listProjects(): Promise<Project[]> {
  return [];
}

export async function getProject(_id: string): Promise<Project | null> {
  return null;
}
