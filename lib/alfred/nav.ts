export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/alfred', label: 'Chat' },
  { href: '/alfred/biblioteca', label: 'Biblioteca' },
  { href: '/alfred/conhecimento', label: 'Conhecimento' },
  { href: '/alfred/projetos', label: 'Projetos' },
  { href: '/alfred/configuracoes', label: 'Configurações' },
];

/** O item de Chat também vale para /alfred/c/[id]. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/alfred') return pathname === '/alfred' || pathname.startsWith('/alfred/c/');
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function sectionTitle(pathname: string): string {
  return NAV_ITEMS.find((i) => isActive(i, pathname))?.label ?? 'Alfred';
}

export interface Suggestion {
  title: string;
  description: string;
  /** Texto que preenche o campo de mensagem. O usuário edita e envia. */
  prompt: string;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    title: 'Analisar oferta',
    description: 'Encontre falhas e oportunidades na sua proposta comercial.',
    prompt: 'Analise esta oferta e aponte falhas e oportunidades:\n\nProduto: \nPúblico: \nPromessa: \nPreço: \nGarantia e bônus: ',
  },
  {
    title: 'Revisar copy',
    description: 'Identifique problemas de argumentação, clareza e conversão.',
    prompt: 'Revise esta copy quanto a argumentação, clareza e conversão:\n\n',
  },
  {
    title: 'Diagnosticar campanha',
    description: 'Analise métricas e identifique gargalos.',
    prompt: 'Diagnostique esta campanha e identifique o principal gargalo:\n\nGasto: \nImpressões: \nCliques: \nCheckouts: \nVendas: \nPeríodo: ',
  },
  {
    title: 'Construir funil',
    description: 'Desenvolva uma estratégia de aquisição e conversão.',
    prompt: 'Monte uma estratégia de aquisição e conversão para:\n\nProduto: \nPúblico: \nTicket: \nCanal principal: ',
  },
];
