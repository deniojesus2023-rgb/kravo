import type { AlfredCapabilities, Concept, Project } from './types';

/**
 * Camada de dados do Alfred. Conceitos e projetos ainda não têm backend (o chat e as conversas estão em `store.ts`; os
 * documentos em `documents.ts`): estas funções devolvem vazio e nenhum recurso é declarado como disponível. Para conectar, troque o corpo
 * destas funções (por exemplo, leituras no Supabase com a RLS do usuário) e ligue a capacidade correspondente.
 */

export const capabilities: AlfredCapabilities = {
  attachments: false,
  knowledge: false,
  projects: false,
  preferences: false,
};

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
