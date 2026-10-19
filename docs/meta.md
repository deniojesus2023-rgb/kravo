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
- `business_management`: **não é pedida** e a kavro não usa nenhum campo que a exija. Em produção, pedir `business{name}` em `/me/adaccounts` falhou com "(#100) Requires business_management permission to access the field". Por isso a kavro não mostra o nome do Business Manager de cada conta.

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

## Diagnóstico de falha na conexão

Quando a conexão falha, o servidor registra uma linha JSON `meta_conexao_falhou` (nos logs da Vercel) com: `reason`, `etapa`, `codigo`, `subcodigo`, `status`, `tipo`, `fbtrace_id`, `mensagem_meta` (já sem valores sensíveis), `redirect_host` e `redirect_path` (sem query), `credenciais_do_app` (`validas`, `invalidas` ou `indeterminado`, de uma sonda `client_credentials` que só roda na falha da troca do código), `formato_app_id_ok` e `formato_chave_secreta_ok` (booleanos; a chave de app da Meta tem 32 caracteres hexadecimais), `usa_config_id` e `versao_graph`.

Nunca entram no log: token, código do login, `state`, chave secreta nem o corpo bruto da resposta. A tela de Integrações mostra só etapa, código, subcódigo e status, a partir de listas fixas.

Leitura rápida: `codigo 1` + "Error validating client secret" = chave secreta que não pertence ao app (ou ao ID configurado). `codigo 100` + subcódigo `36008` = `redirect_uri` diferente do usado no diálogo; `36009` = código já usado ou em formato inválido.

## Campos pedidos à Graph API (somente `ads_read`)

- `/me`: `id` (obrigatório) e, em chamada separada e opcional, `name` (depende de `public_profile`; se falhar, a conexão segue sem o nome).
- `/me/permissions`: sem campos.
- `/me/adaccounts`: `id, account_id, name, currency, account_status, timezone_name`. Nada de `business`, `owner`, saldos, usuários ou expansão de campos.
- `tests/meta.test.ts` registra todas as URLs do fluxo e falha se aparecer qualquer campo fora dessa lista, caminho inesperado ou escopo extra. Antes de acrescentar um campo, confira na documentação da Meta se ele exige outra permissão.
- Não verificado contra a Meta: se `/me/adaccounts` lista também as contas que pertencem a um Business Manager com só `ads_read`. Veja o resultado no primeiro teste real.

## Sincronização de métricas

- Código: `lib/meta/insights.ts` (leitura pura), `sync.ts` (núcleo por conta), `run.ts` (orquestração e erros), `sync-store.ts` (banco, chave de serviço), `app/api/jobs/sync-meta/route.ts` (agendador), `syncMetaNow` em `app/(app)/integracoes/actions.ts`.
- Chamadas (todas só com `ads_read`): `/{act}/campaigns` (`id,name,effective_status,daily_budget`) e `/{act}/insights` (`level=campaign`, `time_increment=1`, `action_attribution_windows=["7d_click"]`, campos em `INSIGHT_FIELDS`). Teste impede campos fora das listas.
- Janela: 30 dias na primeira vez de cada conta, depois os últimos 7 (a Meta reajusta a atribuição). Dias seguem o fuso da conta de anúncios; a tela avisa se diferir de America/Sao_Paulo.
- Só contas escolhidas e em BRL. Métricas só de campanhas ligadas a uma oferta (nome começa com o código; vínculo já existente nunca é trocado).
- Compras: `purchase`, senão `omni_purchase`, nunca somadas. São o que o **Meta reporta**, não vendas reais.
- Cada execução grava uma linha em `sync_runs` com código fixo de erro (`token_invalido`, `limite_da_meta`, `meta_erro`, `banco`). Código 190 desconecta e apaga a credencial. Nada de token ou mensagem da Meta vai para o log ou a tela.
- Agendador: `vercel.json` (diário; o plano gratuito só permite isso). Defina `CRON_SECRET` na Vercel.
- **Não validado contra a Meta real.** Primeiro teste: escolher as contas em Integrações e clicar em "Sincronizar agora".

### Conjuntos e anúncios

- Lidos junto com as campanhas (`/{act}/adsets`, `/{act}/ads`, `insights` com `level=adset|ad`), só os de campanhas ligadas a uma oferta. Métricas em `daily_metrics` nos níveis `adset` e `ad`, com `video_views_3s` (ação `video_view`). Os totais da oferta continuam usando só o nível `campaign`, para não somar o gasto duas vezes.
- Ainda **sem tabela na interface** (abas Conjuntos e Anúncios) e sem criativos (`creatives`). Não validado contra a Meta real.
