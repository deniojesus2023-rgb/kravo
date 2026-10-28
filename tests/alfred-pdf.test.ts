import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, PdfError, chunkPage, cleanPageText, openPdf } from '@/lib/alfred/pdf';
import { makePdf } from './pdf-fixture';

describe('limpeza do texto da página', () => {
  it('une hifenização, colapsa espaços e preserva parágrafos', () => {
    expect(cleanPageText('A garan-\ntia reduz   o\nrisco.\n\n\nNovo parágrafo.')).toBe('A garantia reduz o risco.\n\nNovo parágrafo.');
    expect(cleanPageText('a\u0000b  c')).toBe('ab c');
    expect(cleanPageText('   \n  ')).toBe('');
  });
  it('não junta "palavra-" seguida de maiúscula (travessão, não hifenização)', () => {
    expect(cleanPageText('Meta-\nAds')).toBe('Meta- Ads');
  });
});

describe('divisão em trechos', () => {
  const frase = 'Esta é uma frase sobre oferta e garantia para teste de divisão. ';
  it('página curta vira um trecho só; vazia não vira nada', () => {
    expect(chunkPage('Texto curto.')).toEqual(['Texto curto.']);
    expect(chunkPage('   ')).toEqual([]);
  });
  it('página longa: trechos de até o tamanho, sem vazios, com sobreposição e cobrindo o texto todo', () => {
    const text = frase.repeat(80);
    const chunks = chunkPage(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE + 200);
      expect(c.trim()).toBe(c);
      expect(c.length).toBeGreaterThan(0);
    }
    // Sobreposição: o começo de cada trecho aparece no fim do anterior.
    for (let i = 1; i < chunks.length; i += 1) expect(chunks[i - 1]!.includes(chunks[i]!.slice(0, 30))).toBe(true);
    // Cobertura: a última frase está no último trecho.
    expect(chunks.at(-1)!.endsWith('divisão.')).toBe(true);
  });
  it('corta de preferência no fim de frase', () => {
    const chunks = chunkPage(frase.repeat(80));
    expect(chunks.slice(0, -1).every((c) => /[.?!]$/.test(c))).toBe(true);
  });
  it('palavra gigante sem espaços não trava e avança', () => {
    const t = Date.now();
    const chunks = chunkPage('x'.repeat(10_000));
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('').length).toBeGreaterThanOrEqual(10_000);
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it('é determinístico', () => {
    const text = frase.repeat(60);
    expect(chunkPage(text)).toEqual(chunkPage(text));
  });
});

describe('leitura de PDF', () => {
  it('lê o texto de cada página e a contagem de páginas', async () => {
    const pdf = await openPdf(makePdf(['Primeira pagina sobre ofertas', 'Segunda pagina sobre funis', '']));
    expect(pdf.numPages).toBe(3);
    expect(cleanPageText(await pdf.pageText(1))).toContain('Primeira pagina sobre ofertas');
    expect(cleanPageText(await pdf.pageText(2))).toContain('Segunda pagina sobre funis');
    expect(cleanPageText(await pdf.pageText(3))).toBe('');
    await pdf.close();
  });
  it('recusa o que não é PDF e PDF corrompido', async () => {
    await expect(openPdf(new TextEncoder().encode('isto não é um pdf'))).rejects.toMatchObject({ kind: 'nao_e_pdf' });
    await expect(openPdf(new TextEncoder().encode('%PDF-1.4\nlixo sem estrutura'))).rejects.toBeInstanceOf(PdfError);
  });
});
