# Conexão com o Meta Ads

## Estado (18/10/2026)

- App criado em developers.facebook.com: **KRAVO**, ID `1480399224146629` (o ID é público; a chave secreta nunca entra no repositório).
- Caso de uso: "Mensurar dados de desempenho do anúncio com a API de Marketing" (leitura). O Login do Facebook para Empresas apareceu junto.
- Modo: **desenvolvimento** (não publicado). Funciona só para quem tem função no app, sem revisão, com as contas de anúncios dessa pessoa.
- Verificação da empresa: **bloqueada** por uma restrição temporária da conta do Facebook do administrador. Sem verificação não há Acesso Avançado (ler contas de outras pessoas).
- Contas compradas ou criadas para driblar restrição violam os termos da Meta e não devem ser usadas.

## Permissões

- `ads_read`: ler métricas. É a que a kavro usa.
- `ads_management`: **não pedir**. A kavro não cria, edita nem pausa anúncios (decisão pendente de confirmação, ver CLAUDE.md).
- `business_management`: pode ser necessária para listar contas de anúncios de um Business Manager; confirmar na documentação da Meta ao implementar.

## Campos do app (Configurações → Básico)

| Campo | Valor |
|---|---|
| URL da Política de Privacidade | `https://[ASSIM: domínio]/privacidade` |
| URL dos Termos de Serviço | `https://[ASSIM: domínio]/termos` |
| Exclusão de dados do usuário | "URL de instruções": `https://[ASSIM: domínio]/exclusao-de-dados` |
| Ícone do app | `brand/app-icon-1024.png` |
| Domínios do aplicativo | `[ASSIM: domínio]` |
| Categoria | Negócios e páginas (ou a mais próxima) |
| Redirecionamento OAuth | `https://[ASSIM: domínio]/api/meta/callback` e `http://localhost:3000/api/meta/callback` |

As páginas `/privacidade`, `/termos` e `/exclusao-de-dados` existem e são públicas, mas têm texto-rascunho: preencha `lib/legal.ts` (responsável, documento, e-mail, foro) e peça revisão jurídica antes de enviar à Meta. Enquanto houver `[ASSIM: …]`, as páginas exibem um aviso de rascunho.

## Implementado (18/10/2026), ainda NÃO testado contra a Meta de verdade

- `GET /api/meta/connect`: exige sessão, grava um `state` aleatório em cookie (httpOnly, 10 min) e redireciona ao login do Facebook. Pede só `ads_read` (ou `config_id`, se `META_LOGIN_CONFIG_ID` existir).
- `GET /api/meta/callback`: valida o `state`, troca o código por token de curta e depois de longa duração (~60 dias), testa com chamadas reais (`/me`, `/me/permissions`, `/me/adaccounts`) e só então grava. Sem `ads_read` concedida, não grava nada.
- Token cifrado com AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) em `connection_secrets`, gravado só pelo servidor (`SUPABASE_SERVICE_ROLE_KEY`). Chamadas à Graph API levam `appsecret_proof`.
- Tela `/integracoes` (design `Integracoes.dc.html`): estado, validade (aviso com menos de 7 dias), permissões concedidas, escolha de contas de anúncios (só BRL), reconectar e desconectar (revoga no Facebook, apaga a credencial).
- Migração `20261018160000`: nome do usuário do Facebook e moeda/fuso/status das contas de anúncios.
- Verificado: cifra, montagem do login, `state`, prova do segredo, estado de validade, cliente da Graph API e o fluxo (com a Graph API simulada), rotas protegidas e a tela em conta real (estados vazios, Conectar sem chaves, `state` inválido, autorização negada).
- **Não verificado**: qualquer chamada real à Meta (troca do código, formato exato das respostas, listagem de contas, revogação). Depende de `META_APP_ID`/`META_APP_SECRET`, da rede liberada para `graph.facebook.com` e `www.facebook.com`, e de um login real.

## Falta

1. Variáveis no ambiente: `META_APP_ID`, `META_APP_SECRET`, `TOKEN_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` (e `META_LOGIN_CONFIG_ID`). Ver `.env.example`.
2. Na Meta: configuração de login com `ads_read` e a URI de retorno do endereço público (em localhost o modo de desenvolvimento já aceita).
3. Primeiro teste real de ponta a ponta com a sua conta e uma conta de anúncios.
4. Sincronização de métricas (Graph `insights`) para `daily_metrics`. Não implementada. Campanhas só ganham métricas quando ligadas a uma oferta (prefixo do nome = código da oferta, ou vínculo manual).
5. Páginas legais com dados reais (`lib/legal.ts`) e revisão jurídica.
6. Acesso Avançado: verificação do negócio, screencast e revisão.
