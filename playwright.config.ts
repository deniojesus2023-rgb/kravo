import { defineConfig } from '@playwright/test';

// Variáveis locais (.env.local) valem também para este processo de teste.
try {
  process.loadEnvFile('.env.local');
} catch {
  // Sem .env.local: os testes de autenticação configurada são ignorados.
}

const authConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
// Em ambientes com proxy de saída (como a sessão em nuvem) o fetch do Node só o usa com esta opção.
const proxyEnv = process.env.HTTPS_PROXY
  ? `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=${process.env.NODE_EXTRA_CA_CERTS ?? '/root/.ccr/ca-bundle.crt'}`
  : '';
const chromium = { launchOptions: { executablePath: '/opt/pw-browsers/chromium' } };

export default defineConfig({
  testDir: './e2e',
  projects: [
    // App com dados de exemplo, sem Supabase.
    { name: 'exemplo', testMatch: ['app.spec.ts', 'alfred.spec.ts'], use: { baseURL: 'http://localhost:3100', ...chromium } },
    // App com Supabase configurado: proteção de rotas e telas de login.
    ...(authConfigured
      ? [
          { name: 'autenticacao', testMatch: 'auth.spec.ts', use: { baseURL: 'http://localhost:3101', ...chromium } },
          ...(process.env.E2E_REAL === '1'
            ? [
                // GRAVA no banco real (cria uma oferta no usuário de teste). Só roda com E2E_REAL=1 e a conta vazia;
                // limpe depois com supabase/e2e/limpar.sql.
                { name: 'real', testMatch: 'real.spec.ts', use: { baseURL: 'http://localhost:3101', ...chromium } },
              ]
            : []),
        ]
      : []),
  ],
  webServer: [
    {
      command:
        'NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= pnpm build && NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= pnpm exec next start -p 3100',
      url: 'http://localhost:3100',
      reuseExistingServer: false,
      timeout: 240_000,
    },
    ...(authConfigured
      ? [
          {
            command: `NEXT_DIST_DIR=.next-auth pnpm build && ${proxyEnv} NEXT_DIST_DIR=.next-auth pnpm exec next start -p 3101`,
            url: 'http://localhost:3101/login',
            reuseExistingServer: false,
            timeout: 240_000,
          },
        ]
      : []),
  ],
});
