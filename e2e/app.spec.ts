import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [390, 768, 1024, 1440];
const PAGES = [
  '/',
  '/ofertas/protocolo-vasos-livres',
  '/ofertas/ansiedade-zero',
  '/ofertas/receitas-fit-7-dias',
  '/integracoes',
  '/ofertas/protocolo-vasos-livres/criativos',
  '/login',
  '/cadastro',
  '/ofertas/nova',
  '/privacidade',
  '/termos',
  '/exclusao-de-dados',
];

// Paleta oficial + neutros derivados registrados em app/globals.css.
const ALLOWED = new Set(
  [
    '#0f1114', '#1a1e23', '#272d33', '#30353b', '#c8f169', '#f5f7f8', '#a7adb5', '#34c78a', '#f16d75', '#e8b75b',
    '#8a9099', '#15191e', '#1f242a', '#1e242a', '#171b20', '#1c2127', '#6b737d', '#4a525b', '#d6f788',
  ],
);

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Todas as cores efetivamente usadas na página, convertidas para RGB (ignora o alfa). */
async function usedColors(page: Page): Promise<Array<[string, string]>> {
  return page.evaluate(() => {
    const out = new Map<string, string>();
    const props = [
      'color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
      'outlineColor', 'fill', 'stroke',
    ] as const;
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const toRgb = (value: string): [number, number, number] | null => {
      if (!value || value === 'none' || value === 'transparent') return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return d[3] === 0 ? null : [d[0]!, d[1]!, d[2]!];
    };
    // Cores translúcidas (ex.: tinta de 14% dos badges) são derivadas de um token; só checamos as opacas.
    const raw = (value: string): [number, number, number] | null => {
      const alpha = value.match(/\/\s*([\d.]+)\s*\)$/)?.[1] ?? value.match(/rgba\([^)]*,\s*([\d.]+)\)$/)?.[1];
      if (alpha !== undefined && Number(alpha) < 1) return null;
      return toRgb(value);
    };
    for (const el of document.querySelectorAll('body, body *')) {
      if (el.matches('script, style, next-route-announcer')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none') continue;
      for (const prop of props) {
        if (prop.startsWith('border') && style[prop.replace('Color', 'Width') as 'borderTopWidth'] === '0px') continue;
        if (prop === 'outlineColor' && style.outlineStyle === 'none') continue;
        // fill/stroke só importam em formas que pintam; <svg> e <g> apenas herdam o padrão do navegador.
        if (prop === 'fill' && !['path', 'circle', 'rect', 'text', 'polygon', 'ellipse'].includes(el.tagName)) continue;
        if (prop === 'stroke' && !['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'].includes(el.tagName)) continue;
        const rgb = raw(style[prop]);
        if (!rgb) continue;
        out.set(rgb.join(","), `${prop} on ${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 40)}`);
      }
    }
    return [...out.entries()];
  });
}

for (const path of PAGES) {
  test.describe(path, () => {
    for (const width of WIDTHS) {
      test(`sem rolagem horizontal em ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test('acessibilidade (axe, WCAG A/AA)', async ({ page }) => {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      }
    });

    test('só cores da paleta e dos neutros registrados, sem gradientes', async ({ page }) => {
      await page.goto(path);
      const colors = await usedColors(page);
      const outside = colors.filter(([rgb]) => !ALLOWED.has(hex(...(rgb.split(',').map(Number) as [number, number, number]))));
      expect(outside).toEqual([]);
      const gradients = await page.evaluate(
        () => [...document.querySelectorAll('*')].filter((el) => /gradient/.test(getComputedStyle(el).backgroundImage)).length,
      );
      expect(gradients).toBe(0);
    });
  });
}

test('verde-limão só em marca, CTA, foco e aba ativa', async ({ page }) => {
  for (const path of ['/', '/ofertas/protocolo-vasos-livres']) {
    await page.goto(path);
    const offenders = await page.evaluate(() => {
      const lime = 'rgb(200, 241, 105)';
      const props = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'stroke', 'fill'] as const;
      return [...document.querySelectorAll('body *')]
        .filter((el) => {
          const s = getComputedStyle(el);
          return props.some((p) => s[p] === lime && !(p.startsWith('border') && s.borderTopWidth === '0px' && s.borderBottomWidth === '0px'));
        })
        .filter((el) => {
          const inLogo = el.closest('svg') && el.closest('a[aria-label^="kavro"], header');
          const cta = el.matches('a[href="/ofertas/nova"]') && el.textContent?.includes('Nova oferta');
          const activeTab = el.matches('nav[aria-label="Seções da oferta"] a[aria-current="page"]');
          return !(inLogo || cta || activeTab);
        })
        .map((el) => el.outerHTML.slice(0, 120));
    });
    expect(offenders, path).toEqual([]);
  }
});

test('lucro e positivos usam #34C78A, nunca o verde-limão', async ({ page }) => {
  await page.goto('/');
  const colors = await page.locator('tbody td.text-profit').evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  expect(colors.length).toBeGreaterThan(5);
  for (const c of colors) expect(c).toBe('rgb(52, 199, 138)');
});

test.describe('teclado e foco', () => {
  test('link "Pular para o conteúdo" é o primeiro foco e leva ao conteúdo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();
  });

  test('foco visível em limão', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { color: s.outlineColor, width: s.outlineWidth, style: s.outlineStyle };
    });
    expect(style).toEqual({ color: 'rgb(200, 241, 105)', width: '2px', style: 'solid' });
  });

  test('filtros por ação funcionam por teclado e atualizam total e contagem', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const pausar = page.getByRole('button', { name: 'Pausar · 2' });
    await pausar.focus();
    await page.keyboard.press('Enter');
    await expect(pausar).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByText('Mostrando 2 de 10 ofertas.')).toBeAttached();
    await expect(page.locator('tfoot')).toContainText('Total · Pausar');
    await expect(page.locator('tfoot')).toContainText('−R$ 1.754');
  });

  test('linha da oferta é um link navegável por teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('tbody').getByRole('link', { name: /Ansiedade Zero/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ofertas\/ansiedade-zero$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ansiedade Zero');
    await expect(page.getByRole('heading', { name: 'Por que Pausar' })).toBeVisible();
  });

  test('abas Campanhas/Conjuntos/Anúncios respondem às setas', async ({ page }) => {
    await page.goto('/ofertas/protocolo-vasos-livres');
    const campanhas = page.getByRole('tab', { name: /Campanhas/ });
    await campanhas.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /Conjuntos · 11/ })).toBeFocused();
    await expect(page.getByRole('tabpanel')).toContainText('Disponível na Fase 2');
    await page.keyboard.press('Home');
    await expect(campanhas).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('menu no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('abre como diálogo, fecha com Esc e devolve o foco', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(page.locator('aside')).toBeHidden();
    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Menu de navegação' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Protocolo Vasos Livres/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test('escolher uma oferta navega e fecha o menu', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: /Livro de Enoque/ }).click();
    await expect(page).toHaveURL(/livro-de-enoque$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test('sidebar fixa em desktop com oferta ativa marcada', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ofertas/livro-de-enoque');
  const link = page.getByRole('navigation', { name: 'Ofertas' }).getByRole('link', { name: /Livro de Enoque/ });
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
});

test('períodos sem dados de exemplo mostram estado vazio, sem inventar valores', async ({ page }) => {
  await page.goto('/?periodo=30d');
  await expect(page.getByRole('heading', { name: 'Sem dados de exemplo para este período' })).toBeVisible();
  await expect(page.getByRole('link', { name: '30 dias' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('table')).toHaveCount(0);
});

test('oferta inexistente mostra 404', async ({ page }) => {
  const response = await page.goto('/ofertas/nao-existe');
  expect(response?.status()).toBe(404);
});

test('dados de exemplo e fórmula do lucro estão visíveis', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ofertas/protocolo-vasos-livres');
  await expect(page.getByText('Dados de exemplo', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('receita − reembolsos − gasto em mídia')).toBeVisible();
  await expect(page.getByText('Taxas e custos de produto ainda não cadastrados')).toBeVisible();
  await expect(page.getByText('America/Sao_Paulo').first()).toBeVisible();
});
