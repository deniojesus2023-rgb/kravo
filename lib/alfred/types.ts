/**
 * Tipos do Alfred. Descrevem o que a interface precisa receber de um backend;
 * enquanto ele não existe, a camada de dados (`data.ts`) devolve listas vazias.
 */

export interface Conversation {
  id: string;
  title: string;
  /** ISO 8601. */
  updatedAt: string;
}

export interface ChatSource {
  documentId: string;
  documentName: string;
  page: number | null;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  /** Texto em Markdown. */
  content: string;
  createdAt: string;
  sources?: ChatSource[];
}

export type DocumentStatus = 'aguardando' | 'processando' | 'concluido' | 'parcial' | 'erro';

export interface AlfredDocument {
  id: string;
  name: string;
  /** Ex.: "PDF". */
  type: string;
  pages: number;
  uploadedAt: string;
  category: KnowledgeCategory | null;
  status: DocumentStatus;
  /** Dados reais do processamento. Nunca estimados na interface. */
  processedPages: number;
  failedPages: number;
  concepts: number;
  references: number;
}

export const KNOWLEDGE_CATEGORIES = [
  'Copywriting',
  'Psicologia do consumidor',
  'Pesquisa de mercado',
  'Ofertas',
  'Tráfego pago',
  'Criativos',
  'Funis',
  'Otimização',
  'Métricas',
  'Estratégia comercial',
  'Outros',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface ConceptReference {
  documentId: string;
  documentName: string;
  page: number | null;
}

export interface Concept {
  id: string;
  name: string;
  category: KnowledgeCategory;
  summary: string;
  sourceDocument: string;
  sourceCount: number;
  /** Seções do registro completo. Ausente = o documento não trouxe aquele trecho. */
  definition?: string;
  howItWorks?: string;
  applications?: string[];
  examples?: string[];
  limitations?: string[];
  references?: ConceptReference[];
  related?: Array<{ id: string; name: string }>;
}

export type ProjectStatus = 'ativo' | 'pausado' | 'encerrado';

export interface Project {
  id: string;
  name: string;
  description: string;
  businessType: string;
  market: string;
  product: string;
  audience: string;
  offer: string;
  /** Centavos de BRL, ou `null` se não informado. */
  priceCents: number | null;
  objective: string;
  status: ProjectStatus;
  createdAt: string;
}

/** O que o backend já oferece (chat e conversas têm estado próprio: `chatStatus` em config.ts). Cada recurso só é habilitado na interface quando o seu valor for `true`. */
export interface AlfredCapabilities {
  attachments: boolean;
  documents: boolean;
  knowledge: boolean;
  projects: boolean;
  preferences: boolean;
}
