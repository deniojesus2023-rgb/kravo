/** Resultado e textos de erro do envio. Arquivo sem dependências do servidor: a tela (cliente) importa daqui. */

import type { ModelErrorKind } from './model';
import type { ChatMessageData } from './types';

export const MAX_MESSAGE_CHARS = 8000;

export type SendErrorCode = 'mensagem_vazia' | 'mensagem_longa' | 'conversa_inexistente' | 'limite_diario' | 'falha_ao_salvar' | ModelErrorKind;

export type SendResult =
  | { ok: true; conversationId: string; userMessage: ChatMessageData; assistantMessage: ChatMessageData }
  | { ok: false; error: SendErrorCode; /** Código técnico curto do provedor, para diagnóstico. */ detail?: string };

export const ERROR_TEXT: Record<SendErrorCode, string> = {
  mensagem_vazia: 'Escreva uma mensagem antes de enviar.',
  mensagem_longa: `A mensagem passa de ${MAX_MESSAGE_CHARS.toLocaleString('pt-BR')} caracteres. Divida em partes menores.`,
  conversa_inexistente: 'Esta conversa não existe mais. Comece uma nova.',
  limite_diario: 'Você atingiu o limite de mensagens de hoje. Ele volta amanhã.',
  falha_ao_salvar: 'A resposta foi gerada, mas não deu para salvar a conversa. Tente enviar de novo.',
  chave_invalida: 'O provedor de IA recusou a chave configurada. Avise quem administra o ambiente.',
  modelo_invalido: 'O modelo configurado não existe ou não está disponível para esta chave. Avise quem administra o ambiente.',
  sem_credito: 'A conta do provedor de IA está sem crédito. Avise quem administra o ambiente.',
  limite_do_provedor: 'O provedor de IA limitou as requisições agora. Tente de novo em instantes.',
  requisicao_recusada: 'O provedor de IA recusou a requisição. Avise quem administra o ambiente.',
  indisponivel: 'O provedor de IA não respondeu agora. Sua mensagem não foi enviada nem contada; tente de novo.',
  resposta_vazia: 'O modelo devolveu uma resposta vazia. Tente reformular a mensagem.',
};

import type { IngestErrorCode } from './ingest';

export const INGEST_ERROR_TEXT: Record<IngestErrorCode | 'nao_autorizado' | 'arquivo_invalido' | 'envio_falhou', string> = {
  ocupado: 'Este documento já está sendo lido em outro lugar. Aguarde um instante.',
  arquivo_ausente: 'O arquivo não foi encontrado no armazenamento. Envie o PDF de novo.',
  nao_e_pdf: 'O arquivo não é um PDF válido.',
  pdf_protegido: 'O PDF tem senha e não pode ser lido.',
  pdf_ilegivel: 'Não foi possível abrir o PDF (arquivo corrompido ou em formato incomum).',
  pdf_muito_grande: 'O PDF passa do limite de 2.000 páginas. Divida em partes.',
  duplicado: 'Este PDF já está na biblioteca.',
  sem_texto: 'O PDF não tem texto legível (provavelmente é escaneado, só imagem). Ainda não há leitura por imagem (OCR).',
  chave_invalida: 'O provedor de IA recusou a chave configurada. Avise quem administra o ambiente.',
  modelo_invalido: 'O modelo de embedding configurado não existe ou não está disponível para esta chave, ou não aceita vetores de 1536 números. Confira ALFRED_EMBEDDING_MODEL.',
  sem_credito: 'A conta do provedor de IA está sem crédito.',
  limite_do_provedor: 'O provedor de IA limitou as requisições agora. Continue em instantes.',
  requisicao_recusada: 'O provedor de IA recusou a requisição (verifique se o modelo de embedding aceita 1536 dimensões).',
  indisponivel: 'O provedor de IA não respondeu agora. Continue em instantes.',
  resposta_vazia: 'O provedor devolveu uma resposta inesperada. Continue em instantes.',
  falha_ao_salvar: 'Não deu para salvar o progresso agora. Continue em instantes.',
  nao_autorizado: 'Só administradores podem fazer isso.',
  arquivo_invalido: 'Envie um arquivo PDF de até 50 MB.',
  envio_falhou: 'O envio do arquivo falhou. Tente de novo.',
};
