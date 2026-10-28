/**
 * Markdown mínimo e seguro para as respostas do Alfred: títulos, listas, tabelas, citações, blocos de código,
 * negrito, itálico, código em linha e links http(s). Devolve uma árvore de dados; quem renderiza cria elementos
 * React (nunca HTML bruto), então texto vindo do modelo não executa nada.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; children: Inline[] }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Block[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'table'; header: Inline[][]; align: Array<'left' | 'right' | 'center' | null>; rows: Inline[][][] }
  | { type: 'rule' };

const SAFE_LINK = /^https?:\/\/[^\s]+$/i;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`\n]+)`/.exec(rest))) {
      flush();
      out.push({ type: 'code', text: m[1]! });
      i += m[0].length;
    } else if ((m = /^\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/.exec(rest)) || (m = /^__([^\s_](?:[^_]*[^\s_])?)__/.exec(rest))) {
      flush();
      out.push({ type: 'strong', children: parseInline(m[1]!) });
      i += m[0].length;
    } else if ((m = /^\*([^\s*](?:[^*]*[^\s*])?)\*/.exec(rest)) || (m = /^_([^\s_](?:[^_]*[^\s_])?)_(?![A-Za-z0-9])/.exec(rest))) {
      flush();
      out.push({ type: 'em', children: parseInline(m[1]!) });
      i += m[0].length;
    } else if ((m = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest))) {
      if (SAFE_LINK.test(m[2]!)) {
        flush();
        out.push({ type: 'link', href: m[2]!, children: parseInline(m[1]!) });
      } else {
        // Link com protocolo não permitido (javascript:, data:…) vira só o texto.
        text += m[1];
      }
      i += m[0].length;
    } else {
      text += src[i];
      i += 1;
    }
  }
  flush();
  return out;
}

const splitRow = (line: string): string[] => {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((c) => c.trim());
};
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    let m: RegExpExecArray | null;

    if ((m = /^```\s*([\w+-]*)\s*$/.exec(line))) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) body.push(lines[i++]!);
      i += 1; // fecha o bloco (ou termina o texto, se o modelo não fechou)
      blocks.push({ type: 'code', lang: m[1]!, text: body.join('\n') });
      continue;
    }
    if ((m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line))) {
      blocks.push({ type: 'heading', level: m[1]!.length as 1 | 2 | 3 | 4, children: parseInline(m[2]!) });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1]!)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) rows.push(splitRow(lines[i++]!).map(parseInline).map((c) => c));
      blocks.push({ type: 'table', header: header.map(parseInline), align, rows: rows.map((r) => r) as Inline[][][] });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', children: parseMarkdown(body.join('\n')) });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!) && /^\s*\d+[.)]\s+/.test(lines[i]!) === ordered) {
        let text = lines[i]!.replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        i += 1;
        // Linha de continuação recuada pertence ao mesmo item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]!) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) text += ` ${lines[i++]!.trim()}`;
        items.push(parseInline(text));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    // Parágrafo: junta linhas até uma linha em branco ou o início de outro bloco.
    const para: string[] = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i]!.trim() && !/^(```|#{1,4}\s|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]!) && !(lines[i]!.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1]!))) para.push(lines[i++]!.trim());
    blocks.push({ type: 'paragraph', children: parseInline(para.join(' ')) });
  }
  return blocks;
}

/** Seções analíticas do Alfred. Um título com um destes nomes ganha o estilo de seção. */
export const ANALYSIS_SECTIONS = ['DIAGNÓSTICO', 'ANÁLISE', 'FALHAS E RISCOS', 'RECOMENDAÇÃO', 'PLANO DE AÇÃO'] as const;

export const isAnalysisHeading = (text: string) => (ANALYSIS_SECTIONS as readonly string[]).includes(text.trim().toUpperCase());

export const inlineText = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === 'text' || n.type === 'code' ? n.text : inlineText(n.children))).join('');
