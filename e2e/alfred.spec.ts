import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WIDTHS = [390, 768, 1024, 1440];
const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: '/alfred', heading: /Qual decisão precisamos tomar\?/ },
  { path: '/alfred/biblioteca', heading: /Biblioteca de conhecimento/ },
  { path: '/alfred/conhecimento', heading: /Base de conhecimento/ },
  { path: '/alfred/projetos', heading: /^Projetos$/ },
  { path: '/alfred/configuracoes', heading: /^Configurações$/ },
];

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('[class*="overflow-x-auto"]') && !el.closest('dialog:not([open])') && getComputedStyle(el).position !== 'fixed');
    return { page: doc.scrollWidth - window.innerWidth, wide: wide.slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 60)) };
  });
  expect(over.page, JSON.stringify(over.wide)).toBeLessThanOrEqual(0);
}

for (const width of WIDTHS) {
  test.describe(`largura ${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });
    for (const { path, heading } of PAGES) {
      test(`${path}: título, sem overflow horizontal, sem erros no console`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await noHorizontalOverflow(page);
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe('acessibilidade (axe, WCAG A/AA)', () => {
  for (const { path } of PAGES) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).waitFor();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }
});

test.describe('chat', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('sugestão preenche o campo, e enviar fica desativado e explicado (sem IA conectada)', async ({ page }) => {
    await page.goto('/alfred');
    const box = page.getByLabel('Mensagem para o Alfred');
    await page.getByRole('button', { name: /Analisar oferta/ }).click();
    await expect(box).toBeFocused();
    await expect(box).toHaveValue(/Analise esta oferta/);
    await expect(page.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Anexar arquivo' })).toBeDisabled();
    await expect(page.getByText(/O Alfred precisa da conta e do banco configurados/)).toBeVisible();
    // Enter não envia nada: o texto continua no campo e nenhuma mensagem aparece.
    await box.press('Enter');
    await expect(page.getByRole('log')).toHaveCount(0);
    await expect(box).toHaveValue(/Analise esta oferta/);
  });

  test('as quatro sugestões existem, o campo cresce e Shift+Enter quebra a linha', async ({ page }) => {
    await page.goto('/alfred');
    for (const t of ['Analisar oferta', 'Revisar copy', 'Diagnosticar campanha', 'Construir funil']) await expect(page.getByRole('button', { name: new RegExp(t) })).toBeVisible();
    const box = page.getByLabel('Mensagem para o Alfred');
    const h0 = (await box.boundingBox())!.height;
    await box.focus();
    await page.keyboard.type('linha 1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('linha 2');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('linha 3');
    await expect(box).toHaveValue('linha 1\nlinha 2\nlinha 3');
    expect((await box.boundingBox())!.height).toBeGreaterThan(h0);
  });

  test('integrado à trakfy: item no menu da trakfy, abas das seções e histórico ao lado', async ({ page }) => {
    await page.goto('/alfred');
    const trakfy = page.locator('aside').first();
    await expect(trakfy.getByRole('link', { name: 'Alfred', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(trakfy.getByRole('link', { name: 'Visão geral', exact: true })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Seções do Alfred' });
    for (const n of ['Chat', 'Biblioteca', 'Conhecimento', 'Projetos', 'Configurações']) await expect(tabs.getByRole('link', { name: n, exact: true })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
    const history = page.getByRole('complementary', { name: 'Histórico de conversas' });
    await expect(history.getByRole('link', { name: 'Nova conversa' })).toBeVisible();
    await expect(history.getByText(/Nenhuma conversa ainda/)).toBeVisible();
  });

  test('do menu da trakfy chega ao Alfred e às outras seções pelas abas', async ({ page }) => {
    await page.goto('/');
    await page.locator('aside').first().getByRole('link', { name: 'Alfred', exact: true }).click();
    await expect(page).toHaveURL(/\/alfred$/);
    await page.getByRole('navigation', { name: 'Seções do Alfred' }).getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page).toHaveURL(/\/alfred\/biblioteca$/);
    await expect(page.locator('aside').first().getByRole('link', { name: 'Alfred', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('itens inexistentes dão "Não encontrado", sem dado inventado', async ({ page }) => {
    for (const p of ['/alfred/c/x', '/alfred/biblioteca/x', '/alfred/conhecimento/x', '/alfred/projetos/x']) {
      await page.goto(p);
      await expect(page.getByRole('heading', { name: 'Não encontrado' })).toBeVisible();
    }
  });
});

test.describe('biblioteca e projetos sem backend', () => {
  test('nada de fictício; ações desativadas dizem por quê', async ({ page }) => {
    await page.goto('/alfred/biblioteca');
    await expect(page.getByRole('heading', { name: 'Nenhum documento na biblioteca' })).toBeVisible();
    await expect(page.getByLabel('Selecionar arquivos')).toBeDisabled();
    await expect(page.getByText(/Só administradores adicionam ou removem documentos/)).toBeVisible();
    await page.goto('/alfred/projetos');
    await expect(page.getByRole('heading', { name: 'Nenhum projeto ainda' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Novo projeto/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 780 } });

  test('o menu da trakfy abre, leva ao Alfred e fecha; Esc fecha', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Menu de navegação' });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Menu' }).click();
    await drawer.getByRole('link', { name: 'Alfred', exact: true }).click();
    await expect(page).toHaveURL(/\/alfred$/);
    await expect(drawer).toBeHidden();
  });

  test('o histórico abre como janela "Conversas" e fecha com Esc', async ({ page }) => {
    await page.goto('/alfred');
    await expect(page.getByRole('complementary', { name: 'Histórico de conversas' })).toBeHidden();
    await page.getByRole('button', { name: 'Conversas' }).click();
    const dialog = page.getByRole('dialog', { name: 'Conversas' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Nova conversa' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('campo de mensagem fica fixo na parte de baixo e as áreas de toque são confortáveis', async ({ page }) => {
    await page.goto('/alfred');
    const box = (await page.getByLabel('Mensagem para o Alfred').boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(780 - 120);
    for (const name of ['Menu', 'Enviar mensagem']) {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(40);
    }
  });
});

test('o Alfred usa a identidade da trakfy: mesmo fundo, sem tema próprio e sem dourado', async ({ page }) => {
  await page.goto('/');
  const home = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(home).toBe('rgb(15, 17, 20)');
  await page.goto('/alfred');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(home);
  expect(await page.locator('.alfred').count()).toBe(0);
  // O botão principal usa o verde-limão da trakfy (#C8F169), não o dourado antigo (#E5C079).
  const cta = await page.getByRole('complementary', { name: 'Histórico de conversas' }).getByRole('link', { name: 'Nova conversa' }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(cta).toBe('rgb(200, 241, 105)');
});
