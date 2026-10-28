/** Leitura de PDF e divisão em trechos. `cleanPageText` e `chunkPage` são puros e testados; `openPdf` usa o unpdf. */

export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 150;
const MIN_CHUNK = 60;

/** Normaliza o texto de uma página: sem caracteres nulos, sem hifenização de fim de linha, espaços colapsados. */
export function cleanPageText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    // "exem-\nplo" → "exemplo"
    .replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2')
    .replace(/[ \t\f\v ]+/g, ' ')
    // Linha única vira espaço; linha em branco (parágrafo) é mantida.
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/ *\n{2,} */g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/**
 * Divide o texto de UMA página em trechos de até `size` caracteres, com sobreposição, cortando de preferência
 * no fim de uma frase. Os trechos nunca atravessam páginas, então a citação (documento e página) é exata.
 */
export function chunkPage(raw: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const text = cleanPageText(raw);
  if (text.length === 0) return [];
  if (text.length <= size) return [text];

  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const floor = Math.floor(size * 0.6);
      // Melhor corte: fim de parágrafo ou de frase na parte final da janela; senão, o último espaço.
      const sentence = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      const space = window.lastIndexOf(' ');
      const cut = sentence >= floor ? sentence + 1 : space >= floor ? space : -1;
      if (cut > 0) end = start + cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece.length >= MIN_CHUNK || out.length === 0) out.push(piece);
    else out[out.length - 1] += ` ${piece}`;
    if (end >= text.length) break;
    // Recua para a sobreposição, no começo de uma palavra, garantindo que a janela avança.
    let next = Math.max(end - overlap, start + 1);
    const space = text.indexOf(' ', next);
    if (space !== -1 && space < end) next = space + 1;
    start = next > start ? next : end;
  }
  return out.filter(Boolean);
}

export interface PdfReader {
  numPages: number;
  /** Texto da página (1 a numPages). Pode lançar se a página estiver corrompida. */
  pageText(page: number): Promise<string>;
  close(): Promise<void>;
}

export class PdfError extends Error {
  constructor(readonly kind: 'nao_e_pdf' | 'pdf_protegido' | 'pdf_ilegivel') {
    super(kind);
  }
}

/** Abre o PDF (bytes) para leitura página a página. */
export async function openPdf(bytes: Uint8Array): Promise<PdfReader> {
  // Cabeçalho "%PDF-" nos primeiros bytes (alguns arquivos têm lixo antes dele).
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (!head.includes('%PDF-')) throw new PdfError('nao_e_pdf');
  const { getDocumentProxy } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new PdfError(name === 'PasswordException' ? 'pdf_protegido' : 'pdf_ilegivel');
  }
  return {
    numPages: pdf.numPages,
    async pageText(page) {
      const p = await pdf.getPage(page);
      const content = await p.getTextContent();
      let text = '';
      for (const item of content.items) {
        if ('str' in item) text += item.str + (item.hasEOL ? '\n' : ' ');
      }
      return text;
    },
    close: async () => void (await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.()),
  };
}
