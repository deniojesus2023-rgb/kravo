import { describe, expect, it } from 'vitest';
import { groupConversations, groupOf } from '@/lib/alfred/history';
import { inlineText, isAnalysisHeading, parseInline, parseMarkdown } from '@/lib/alfred/markdown';
import { isActive, NAV_ITEMS, sectionTitle } from '@/lib/alfred/nav';
import * as data from '@/lib/alfred/data';

describe('histórico por período (America/Sao_Paulo)', () => {
  const now = new Date('2026-10-28T15:00:00Z'); // 12h em São Paulo
  it('agrupa por dia civil de São Paulo, não por UTC', () => {
    expect(groupOf('2026-10-28T02:30:00Z', now)).toBe('ontem'); // 23h30 do dia 27 em SP
    expect(groupOf('2026-10-28T03:30:00Z', now)).toBe('hoje'); // 00h30 do dia 28 em SP
    expect(groupOf('2026-10-27T12:00:00Z', now)).toBe('ontem');
    expect(groupOf('2026-10-21T12:00:00Z', now)).toBe('semana');
    expect(groupOf('2026-10-10T12:00:00Z', now)).toBe('mes');
    expect(groupOf('2026-08-01T12:00:00Z', now)).toBe('antigas');
  });
  it('ordena do mais recente e omite grupos vazios', () => {
    const g = groupConversations(
      [
        { id: 'a', title: 'A', updatedAt: '2026-10-27T12:00:00Z' },
        { id: 'b', title: 'B', updatedAt: '2026-10-28T14:00:00Z' },
        { id: 'c', title: 'C', updatedAt: '2026-10-28T10:00:00Z' },
      ],
      now,
    );
    expect(g.map((x) => x.label)).toEqual(['Hoje', 'Ontem']);
    expect(g[0]!.items.map((c) => c.id)).toEqual(['b', 'c']);
    expect(groupConversations([], now)).toEqual([]);
  });
});

describe('Markdown seguro', () => {
  it('títulos, listas, citação e código', () => {
    const b = parseMarkdown('## DIAGNÓSTICO\n\nTexto **forte** e `x`.\n\n- um\n- dois\n\n1. a\n2. b\n\n> citação\n\n```js\nconst a = 1;\n```');
    expect(b.map((x) => x.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code']);
    expect(b[2]).toMatchObject({ type: 'list', ordered: false });
    expect(b[3]).toMatchObject({ type: 'list', ordered: true });
    expect(b[5]).toEqual({ type: 'code', lang: 'js', text: 'const a = 1;' });
  });
  it('tabelas com alinhamento', () => {
    const b = parseMarkdown('| Canal | ROAS |\n|:--|--:|\n| Meta | 2,4x |\n| Google | 1,8x |');
    expect(b).toHaveLength(1);
    const t = b[0]!;
    expect(t.type).toBe('table');
    if (t.type === 'table') {
      expect(t.align).toEqual(['left', 'right']);
      expect(t.rows).toHaveLength(2);
      expect(inlineText(t.rows[1]![0]!)).toBe('Google');
    }
  });
  it('bloco de código não fechado vai até o fim, sem travar', () => {
    expect(parseMarkdown('```\nlinha')).toEqual([{ type: 'code', lang: '', text: 'linha' }]);
  });
  it('só links http(s) viram link; o resto vira texto', () => {
    expect(parseInline('[ok](https://exemplo.com/a)')).toEqual([{ type: 'link', href: 'https://exemplo.com/a', children: [{ type: 'text', text: 'ok' }] }]);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.com']) {
      const nodes = parseInline(`[clique](${bad})`);
      expect(nodes.some((n) => n.type === 'link')).toBe(false);
      expect(inlineText(nodes)).toBe('clique');
    }
  });
  it('HTML bruto fica como texto', () => {
    const nodes = parseInline('<img src=x onerror=alert(1)> <b>x</b>');
    expect(nodes.every((n) => n.type === 'text')).toBe(true);
    expect(inlineText(nodes)).toBe('<img src=x onerror=alert(1)> <b>x</b>');
  });
  it('não confunde snake_case nem asteriscos soltos com ênfase', () => {
    expect(inlineText(parseInline('use meta_ads_roas e 2 * 3 * 4'))).toBe('use meta_ads_roas e 2 * 3 * 4');
    expect(parseInline('use meta_ads_roas').every((n) => n.type === 'text')).toBe(true);
  });
  it('reconhece as seções analíticas', () => {
    expect(isAnalysisHeading('Plano de ação')).toBe(true);
    expect(isAnalysisHeading('FALHAS E RISCOS')).toBe(true);
    expect(isAnalysisHeading('Outro título')).toBe(false);
  });
  it('texto longo e hostil não trava', () => {
    const t = Date.now();
    parseMarkdown('*'.repeat(5000) + '\n' + '['.repeat(2000) + '\n' + '|'.repeat(3000));
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe('navegação', () => {
  it('Chat vale para a raiz e para conversas; os outros por prefixo', () => {
    const [chat, library] = NAV_ITEMS;
    expect(isActive(chat!, '/alfred')).toBe(true);
    expect(isActive(chat!, '/alfred/c/abc')).toBe(true);
    expect(isActive(chat!, '/alfred/biblioteca')).toBe(false);
    expect(isActive(library!, '/alfred/biblioteca/123')).toBe(true);
    expect(sectionTitle('/alfred/conhecimento')).toBe('Conhecimento');
  });
});

describe('camada de dados sem backend', () => {
  it('documentos, conceitos e projetos: nada fictício e nenhum recurso declarado disponível', async () => {
    expect(await data.listDocuments()).toEqual([]);
    expect(await data.listConcepts()).toEqual([]);
    expect(await data.listProjects()).toEqual([]);
    expect(await data.getDocument('x')).toBeNull();
    expect(Object.values(data.capabilities).some(Boolean)).toBe(false);
  });
});
