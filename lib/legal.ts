/**
 * Dados do responsável pelo serviço, usados nas páginas legais (/privacidade, /termos,
 * /exclusao-de-dados). Valores entre [ASSIM: …] são placeholders: preencha com os dados reais
 * antes de enviar as páginas à Meta. Enquanto houver placeholder, as páginas mostram um aviso de rascunho.
 */
export const LEGAL = {
  controlador: '[ASSIM: nome ou razão social do responsável]',
  documento: '[ASSIM: CPF ou CNPJ]',
  email: '[ASSIM: e-mail de contato e de privacidade]',
  endereco: '[ASSIM: endereço do responsável]',
  foro: '[ASSIM: cidade e UF do foro]',
  atualizadoEm: '18 de outubro de 2026',
  prazoExclusaoDias: 15,
} as const;

export const hasLegalPlaceholders = (): boolean =>
  Object.values(LEGAL).some((v) => typeof v === 'string' && v.includes('[ASSIM'));
