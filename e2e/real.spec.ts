import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Fluxo com o Supabase real e um usuário de teste temporário (E2E_REAL_EMAIL / E2E_REAL_PASSWORD).
 * Parte 1: conta vazia e cadastro de oferta pelo app.
 * Parte 2 (E2E_REAL_SEEDED=1): números conhecidos semeados no banco aparecem corretos nas telas.
 */

const EMAIL = process.env.E2E_REAL_EMAIL;
const PASSWORD = process.env.E2E_REAL_PASSWORD;
const ID_FILE = '.e2e-real-offer-id';

test.skip(!EMAIL || !PASSWORD, 'defina E2E_REAL_EMAIL e E2E_REAL_PASSWORD (usuário de teste temporário)');

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(EMAIL!);
  await page.getByLabel('Senha').fill(PASSWORD!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe.serial('oferta com dados reais do usuário', () => {
  test('conta vazia e cadastro de oferta', async ({ page }) => {
    await login(page);

    // Estado vazio, sem dados de exemplo.
    await expect(page.getByRole('heading', { name: 'Nenhuma oferta ainda' })).toBeVisible();
    await expect(page.getByText('Dados de exemplo', { exact: true })).toHaveCount(0);
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByText('Meta Ads não conectado')).toBeVisible();
    await expect(sidebar.getByText('Nenhuma sincronização ainda')).toBeVisible();
    await expect(sidebar.getByText('Nenhuma oferta ainda.')).toBeVisible();
    await expect(page.getByText('Ansiedade Zero')).toHaveCount(0);

    await page.getByRole('link', { name: 'Cadastrar primeira oferta' }).click();
    await expect(page).toHaveURL(/\/ofertas\/nova$/);

    // Validação por campo.
    await page.getByRole('button', { name: 'Criar oferta' }).click();
    await expect(page.getByText('Informe o nome da oferta.')).toBeVisible();
    await expect(page.getByText('Use de 2 a 12 letras ou números')).toBeVisible();
    await expect(page.getByText('Informe um preço válido')).toBeVisible();

    // Os valores digitados são mantidos quando há erro.
    await page.getByLabel('Nome da oferta').fill('Oferta E2E');
    await page.getByLabel('Código das campanhas').fill('e2edemo');
    await page.getByLabel('Preço (BRL)').fill('abc');
    await page.getByRole('button', { name: 'Criar oferta' }).click();
    await expect(page.getByText('Informe um preço válido')).toBeVisible();
    await expect(page.getByLabel('Nome da oferta')).toHaveValue('Oferta E2E');

    await page.getByLabel('Preço (BRL)').fill('149,90');
    await page.getByLabel('Plataforma de vendas').selectOption('Kiwify');
    await page.getByRole('button', { name: 'Criar oferta' }).click();

    // Vai para o dashboard da oferta recém-criada.
    await expect(page).toHaveURL(/\/ofertas\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    writeFileSync(ID_FILE, id);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oferta E2E');
    await expect(page.getByText('Kiwify · R$ 149,90 · Sem conta de anúncios')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Por que Dados insuficientes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nenhum dado neste período' })).toBeVisible();
    const kpis = page.getByRole('region', { name: 'Indicadores da oferta' });
    await expect(kpis).toContainText('R$ 0');
    await expect(kpis).toContainText('—'); // ROAS e CPA sem dados

    // Aparece na sidebar e na Visão geral.
    await expect(page.getByRole('navigation', { name: 'Ofertas' }).getByRole('link', { name: /Oferta E2E/ })).toHaveAttribute('aria-current', 'page');
    await page.goto('/');
    await expect(page.getByText('Nenhum dado de mídia nem de vendas neste período')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('Dados insuficientes');

    // Código repetido.
    await page.goto('/ofertas/nova');
    await page.getByLabel('Nome da oferta').fill('Outra');
    await page.getByLabel('Código das campanhas').fill('E2EDEMO');
    await page.getByLabel('Preço (BRL)').fill('10');
    await page.getByRole('button', { name: 'Criar oferta' }).click();
    await expect(page.getByText('Já existe uma oferta com este código.')).toBeVisible();

    // Oferta de outro usuário ou inexistente: 404.
    expect((await page.goto('/ofertas/00000000-0000-4000-8000-000000000000'))?.status()).toBe(404);
  });

  test('números semeados no banco aparecem corretos', async ({ page }) => {
    test.skip(!process.env.E2E_REAL_SEEDED, 'defina E2E_REAL_SEEDED=1 depois de semear os dados');
    const id = readFileSync(ID_FILE, 'utf8').trim();
    await login(page);
    await page.goto(`/ofertas/${id}`);

    const kpis = page.getByRole('region', { name: 'Indicadores da oferta' });
    const card = (label: string) => kpis.locator('div.card', { has: page.getByText(label, { exact: true }) });
    await expect(card('Gasto')).toContainText('R$ 700');
    await expect(card('Gasto')).toContainText('+100,0%'); // 70.010 vs 35.000 no período anterior
    await expect(card('Receita')).toContainText('R$ 899');
    await expect(card('Lucro líquido')).toContainText('R$ 49');
    await expect(card('Reembolsos')).toContainText('R$ 150');
    await expect(card('Reembolsos')).toContainText('16,7%');
    await expect(card('ROAS real')).toContainText('1,28x');
    await expect(card('ROAS Meta')).toContainText('1,71x');
    await expect(card('CPA')).toContainText('R$ 116,68');
    await expect(card('Ticket médio')).toContainText('R$ 149,90');

    // Menos de 30 vendas: Dados insuficientes, com o critério e o valor real.
    await expect(page.getByRole('heading', { name: 'Por que Dados insuficientes' })).toBeVisible();
    await expect(page.getByRole('region', { name: /Por que/ }).or(page.locator('section[aria-labelledby="por-que"]'))).toContainText('Mínimo 30 · Não atende');

    // Funil e campanha com os números semeados.
    const funnel = page.locator('section[aria-labelledby="funil"]');
    await expect(funnel).toContainText('16.000');
    await expect(funnel).toContainText('320');
    await expect(funnel).toContainText('240');
    await expect(funnel).toContainText('48');
    const campaigns = page.getByRole('region', { name: 'Estrutura de campanhas' });
    await expect(campaigns).toContainText('E2EDEMO_CBO_ESCALA');
    await expect(campaigns).toContainText('R$ 200/dia');
    await expect(campaigns).toContainText('1,28x');
    await expect(campaigns).toContainText('Campanhas · 1');
    await expect(campaigns).toContainText('Conjuntos · 0');

    // O gráfico existe e descreve os valores reais; períodos de 1 e 30 dias carregam sem erro.
    await expect(page.getByRole('img', { name: /Gasto e receita por dia|gasto e receita por dia/i })).toBeVisible();
    for (const p of ['hoje', 'ontem', '30d']) {
      const response = await page.goto(`/ofertas/${id}?periodo=${p}`);
      expect(response?.status(), p).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oferta E2E');
    }
    // 30 dias inclui também o dia semeado de 8 dias atrás (R$ 350 de gasto, 2 pedidos) e não tem período anterior com dados.
    await page.goto(`/ofertas/${id}?periodo=30d`);
    await expect(card('Gasto')).toContainText('R$ 1.050');
    await expect(card('Gasto')).toContainText('sem base de comparação');
    await expect(card('Receita')).toContainText('R$ 1.199');

    // Visão geral com os mesmos totais.
    await page.goto('/');
    await expect(page.locator('tfoot')).toContainText('R$ 700');
    await expect(page.locator('tfoot')).toContainText('1,28x');
    await expect(page.getByText('Nenhum dado de mídia nem de vendas neste período')).toHaveCount(0);
  });
});

test.describe('integração com o Meta (sem chaves do app neste ambiente)', () => {
  test('tela de Integrações em conta nova, acessível', async ({ page }) => {
    await login(page);
    await page.goto('/integracoes');
    await expect(page.getByRole('heading', { level: 1, name: 'Integrações' })).toBeVisible();
    await expect(page.getByText('Não conectado').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Conectar com Facebook' })).toBeVisible();
    await expect(page.getByText('As contas aparecem aqui depois que você conectar o Meta Ads.')).toBeVisible();
    for (const name of ['Kiwify', 'Hotmart', 'Eduzz', 'Shopify']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Em breve' })).toHaveCount(3);
    // Kiwify tem formulário de conexão (credenciais só no servidor, campo secreto mascarado).
    await expect(page.getByRole('button', { name: 'Conectar Kiwify' })).toBeVisible();
    await expect(page.getByLabel('client_secret')).toHaveAttribute('type', 'password');
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  test('Conectar sem as chaves do app avisa, e não redireciona ao Facebook', async ({ page }) => {
    await login(page);
    await page.goto('/integracoes');
    await page.getByRole('link', { name: 'Conectar com Facebook' }).click();
    await expect(page).toHaveURL(/\/integracoes\?meta=nao_configurado$/);
    await expect(page.locator('main [role="alert"]')).toContainText('ainda não está configurada');
  });

  test('retorno com state inválido ou autorização negada não conecta nada', async ({ page }) => {
    await login(page);
    await page.goto('/api/meta/callback?code=falso&state=falso');
    await expect(page).toHaveURL(/meta=estado_invalido$/);
    await expect(page.locator('main [role="alert"]')).toContainText('não pôde ser confirmada');
    await page.goto('/api/meta/callback?error=access_denied&state=qualquer');
    await expect(page).toHaveURL(/meta=negado$/);
    await expect(page.locator('main [role="alert"]')).toContainText('Nada foi conectado');
    await page.goto('/integracoes');
    await expect(page.getByText('Não conectado').first()).toBeVisible();
  });

  test('falha mostra etapa e código da Meta, e ignora parâmetros forjados', async ({ page }) => {
    await login(page);
    await page.goto('/integracoes?meta=meta&etapa=troca_do_codigo&codigo=100&http=400');
    await expect(page.locator('main [role="alert"]')).toContainText('A Meta recusou a conexão');
    await expect(page.locator('main [role="alert"]')).toContainText(
      'Detalhe técnico: etapa: troca do código do login por um token · código da Meta: 100 · status HTTP: 400.',
    );
    await page.goto('/integracoes?meta=meta&etapa=%3Cb%3Ex%3C%2Fb%3E&codigo=12ab&http=99999');
    await expect(page.locator('main [role="alert"]')).not.toContainText('Detalhe técnico');
    // Mensagens de sucesso nunca mostram detalhe técnico.
    await page.goto('/integracoes?meta=desconectado&etapa=troca_do_codigo&codigo=100');
    await expect(page.locator('main [role="status"]')).not.toContainText('Detalhe técnico');
  });
});

test.describe('configurações e notificações (conta real, só leitura)', () => {
  test('a tela mostra o estado deste aparelho e as preferências, acessível', async ({ page }) => {
    await login(page);
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notificações neste aparelho' })).toBeVisible();
    for (const label of ['Venda aprovada', 'Pix gerado', 'Boleto gerado', 'Reembolso', 'Chargeback', 'Manhã, às 08h', 'Tarde, às 14h', 'Noite, às 20h']) {
      await expect(page.getByLabel(label)).toBeChecked();
    }
    await expect(page.getByLabel('Esconder valores em dinheiro nas notificações')).not.toBeChecked();
    // Sem chaves VAPID neste ambiente a tela avisa; com elas, pede para ativar. Nunca fica em branco.
    await expect(page.getByText(/Verificando|não estão configuradas|Ativar neste aparelho|não suporta|bloqueadas|instale a trakfy/i).first()).toBeVisible();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('conexão da Kiwify: o resultado aparece no card', () => {
  test('erro mostra a mensagem e a etapa dentro do card, e ignora parâmetros forjados', async ({ page }) => {
    await login(page);
    await page.goto('/integracoes?kiwify=credencial&kstep=token&khttp=400');
    const card = page.locator('#kiwify');
    await expect(card.locator('[role="alert"]')).toContainText('recusou o client_id ou o client_secret');
    await expect(card.locator('[role="alert"]')).toContainText('Detalhe técnico: etapa: troca das credenciais por um token (oauth/token) · status HTTP: 400.');
    await page.goto('/integracoes?kiwify=credencial&kstep=%3Cb%3Ex%3C%2Fb%3E&khttp=12ab');
    await expect(page.locator('#kiwify [role="alert"]')).not.toContainText('Detalhe técnico');
    await page.goto('/integracoes?kiwify=conta&kstep=produtos&khttp=403');
    await expect(page.locator('#kiwify [role="alert"]')).toContainText('ID da conta');
  });
});

test.describe('Kiwify por URL (conta real, só leitura)', () => {
  test('o card oferece a URL gerada pela trakfy; quando conectado, mostra a URL e o passo a passo', async ({ page }) => {
    await login(page);
    await page.goto('/integracoes');
    const card = page.locator('#kiwify');
    await expect(card.getByRole('heading', { name: 'Kiwify' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Gerar URL do webhook' }).or(card.getByText('Cole esta URL na Kiwify'))).toBeVisible();
    // Sem segredos na tela: nada de client_secret preenchido, e a chave de API fica numa seção recolhida.
    await expect(card.locator('input[type="password"]:visible')).toHaveCount(0);
  });
});
