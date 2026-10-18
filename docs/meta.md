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

## Falta

1. Domínio público (deploy), para as URLs acima.
2. Dados reais em `lib/legal.ts`.
3. Fluxo OAuth no app (botão em Integrações, callback, token de longa duração criptografado, escolha de contas, sincronização). Não implementado.
4. Variáveis de ambiente: `META_APP_ID` e `META_APP_SECRET` (a chave secreta só no servidor).
5. Liberar na rede do ambiente de desenvolvimento: `graph.facebook.com` e `www.facebook.com`.
6. Acesso Avançado: verificação do negócio, screencast e revisão.
