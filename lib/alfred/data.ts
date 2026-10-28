import type { AlfredCapabilities, AlfredDocument, Concept, Project } from './types';

/**
 * Camada de dados do Alfred. Documentos, conceitos e projetos ainda não têm backend (o chat e as conversas estão em
 * `store.ts`): estas funções devolvem vazio e nenhum recurso é declarado como disponível. Para conectar, troque o corpo
 * destas funções (por exemplo, leituras no Supabase com a RLS do usuário) e ligue a capacidade correspondente.
 */

export const capabilities: AlfredCapabilities = {
  attachments: false,
  documents: false,
  knowledge: false,
  projects: false,
  preferences: false,
};

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
