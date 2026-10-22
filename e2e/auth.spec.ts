import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * App com Supabase configurado. Estes testes NÃO exigem rede para o Supabase:
 * sem cookie de sessão a proteção de rotas não consulta o servidor, e a validação
 * dos formulários roda antes de qualquer chamada. O que depende do Supabase real
 * (credenciais, e-mails) fica em testes marcados com E2E_AUTH_NETWORK=1.
 */

test.describe('rotas protegidas', () => {
  for (const path of ['/', '/ofertas/ansiedade-zero', '/integracoes', '/configuracoes', '/ofertas/nova']) {
    test(`${path} sem sessão vai para o login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    });
  }

  test('preserva o caminho com query no parâmetro next', async ({ page }) => {
    await page.goto('/ofertas/ansiedade-zero?periodo=7d');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/ofertas/ansiedade-zero?periodo=7d');
  });

  test('login, cadastro e callback são públicos', async ({ page }) => {
    expect((await page.goto('/login'))?.status()).toBe(200);
    expect((await page.goto('/cadastro'))?.status()).toBe(200);
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/login\?erro=link$/);
    await expect(page.locator('main [role="alert"]')).toContainText('inválido ou expirou');
  });

  for (const [path, heading] of [
    ['/privacidade', 'Política de privacidade'],
    ['/termos', 'Termos de serviço'],
    ['/exclusao-de-dados', 'Exclusão de dados'],
  ] as const) {
    test(`${path} é pública (a Meta precisa abrir sem login)`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    });
  }

  for (const path of ['/api/meta/connect', '/api/meta/callback?code=x&state=y']) {
    test(`${path} sem sessão vai para o login`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toContain('/login');
    });
  }

  test('app instalável: manifest, service worker e ícones abrem sem login (o iPhone precisa deles antes de entrar)', async ({ request }) => {
    const manifest = await request.get('/manifest.webmanifest', { maxRedirects: 0 });
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toMatchObject({ name: 'trakfy', display: 'standalone', theme_color: '#0F1114' });
    const sw = await request.get('/sw.js', { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("addEventListener('push'");
    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/apple-icon.png']) {
      const r = await request.get(icon, { maxRedirects: 0 });
      expect(r.status(), icon).toBe(200);
      expect(r.headers()['content-type']).toContain('image/png');
    }
  });

  test('agendadores exigem o segredo; o webhook da Kiwify é público mas não revela nada', async ({ request }) => {
    for (const path of ['/api/jobs/resumo?slot=noite', '/api/jobs/resumo', '/api/jobs/sync-meta', '/api/jobs/sync-meta?modo=leve', '/api/jobs/sync-vendas']) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(401);
      expect((await request.get(path, { maxRedirects: 0, headers: { authorization: 'Bearer errado' } })).status(), path).toBe(401);
    }
    const hook = await request.post('/api/webhooks/kiwify/abcdefghijklmnopqrstuvwxyz012345', { data: { qualquer: 'coisa' }, maxRedirects: 0 });
    expect(hook.status()).not.toBe(307); // não passa pelo login
    expect([404, 503]).toContain(hook.status()); // desconhecido ou sem a chave de serviço neste ambiente
    expect(await hook.text()).toBe('');
  });

  test('nenhum dado de oferta vaza antes do login', async ({ request }) => {
    const response = await request.get('/ofertas/protocolo-vasos-livres', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(await response.text()).not.toContain('Protocolo Vasos Livres');
  });
});

test.describe('formulários', () => {
  test('login: campos rotulados, validação e erro anunciado', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('E-mail')).toHaveAttribute('autocomplete', 'email');
    await expect(page.getByLabel('Senha')).toHaveAttribute('autocomplete', 'current-password');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('Informe um e-mail válido.');
    await page.getByLabel('E-mail').fill('ana@exemplo.com');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('Informe a senha.');
  });

  test('login por link de acesso e alternância por teclado', async ({ page }) => {
    await page.goto('/login');
    const link = page.getByRole('link', { name: 'Link de acesso' });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/modo=link/);
    await expect(page.getByLabel('Senha')).toHaveCount(0);
    await page.getByRole('button', { name: 'Enviar link de acesso' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('Informe um e-mail válido.');
  });

  test('cadastro valida o tamanho da senha', async ({ page }) => {
    await page.goto('/cadastro');
    await page.getByLabel('E-mail').fill('ana@exemplo.com');
    await page.getByLabel('Senha').fill('curta');
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('A senha precisa ter ao menos 8 caracteres.');
  });

  for (const path of ['/login', '/login?modo=link', '/cadastro']) {
    for (const width of [390, 1440]) {
      test(`${path} em ${width}px: acessível e sem rolagem horizontal`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  }

  test('botão principal usa o verde-limão (CTA) e o foco é visível', async ({ page }) => {
    await page.goto('/login');
    const button = page.getByRole('button', { name: 'Entrar' });
    await expect(button).toHaveCSS('background-color', 'rgb(200, 241, 105)');
    await page.getByLabel('E-mail').focus();
    await expect(page.getByLabel('E-mail')).toHaveCSS('outline-color', 'rgb(200, 241, 105)');
  });
});

test.describe('com o Supabase real (precisa de rede liberada)', () => {
  test.skip(!process.env.E2E_AUTH_NETWORK, 'defina E2E_AUTH_NETWORK=1 com o host do Supabase liberado');

  test('senha errada mostra mensagem em português, sem texto bruto do servidor', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('ninguem-existe@exemplo.com');
    await page.getByLabel('Senha').fill('senha-incorreta-123');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('main [role="alert"]')).toHaveText('E-mail ou senha incorretos.');
    await expect(page).toHaveURL(/\/login/);
  });
});
