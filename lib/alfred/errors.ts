/** Resultado e textos de erro do envio. Arquivo sem dependências do servidor: a tela (cliente) importa daqui. */

import type { ModelErrorKind } from './model';
import type { ChatMessageData } from './types';

export const MAX_MESSAGE_CHARS = 8000;

export type SendErrorCode = 'mensagem_vazia' | 'mensagem_longa' | 'conversa_inexistente' | 'limite_diario' | 'falha_ao_salvar' | ModelErrorKind;

export type SendResult =
  | { ok: true; conversationId: string; userMessage: ChatMessageData; assistantMessage: ChatMessageData }
  | { ok: false; error: SendErrorCode };

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
