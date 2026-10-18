# Banco de dados (Fase 2, etapa 1)

Migrações em `supabase/migrations/`, aplicadas em ordem. Testadas num Postgres local (PGlite) com `pnpm test` e **aplicadas ao projeto Supabase `kravo`** (sa-east-1) em 18/10/2026 pela API de gerenciamento. O isolamento foi verificado no banco real com `supabase/verificar_rls.sql` (termina sempre em rollback).

## Decisões

- **Pedido a pedido.** `orders` guarda status, UTMs e `event_id` de cada pedido. Os totais por dia saem das views `offer_daily_sales` e `offer_daily_metrics`.
- **Receita aprovada** inclui pedidos depois reembolsados; o reembolso é subtraído à parte (`refunded_cents`). Reembolso e chargeback entram no dia da aprovação do pedido (coorte). O dia é calculado em America/Sao_Paulo.
- **Gasto da oferta** soma só `daily_metrics.level = 'campaign'`, para não contar duas vezes.
- **Dinheiro** em centavos (`bigint`). Texto + `CHECK` no lugar de enum.
- **Limites de decisão** por oferta em `offers.decision_params` (`jsonb`, nulo = padrão do sistema).
- **Ofertas com dados não se apagam**: arquivam-se (`status = 'arquivada'`). Só apagar o usuário em `auth.users` remove tudo (LGPD).

## Segurança

- RLS em todas as tabelas, por `user_id`. FKs compostas `(id, user_id)` impedem apontar para dados de outro usuário.
- O navegador (`authenticated`) escreve só em `offers` e em colunas pontuais (`ad_accounts.selected`, `*.offer_id`, `alerts.resolved_at`, nome e idioma do perfil). Métricas, pedidos, eventos e sincronizações só o servidor (`service_role`) escreve.
- Credenciais ficam cifradas em `connection_secrets`, sem nenhum GRANT para o navegador. A chave de cifra fica fora do banco.
- `anon` não tem acesso a nada.

## Ainda não coberto

Aplicação num projeto real, Auth na interface, troca de `lib/data/sample` por leitura do banco, jobs de sincronização.

## Autenticação (Fase 2, etapa 2)

- E-mail e senha, link de acesso (sem criar conta por ele) e cadastro, com `@supabase/ssr`. Páginas `/login` e `/cadastro`, callback em `/auth/callback`, saída pelo botão "Sair" da sidebar.
- `proxy.ts` renova a sessão e redireciona para `/login?next=…` quem não está logado. Sem as variáveis do Supabase ele não faz nada (modo dados de exemplo).
- Só a URL e a chave publicável vão para o navegador. O destino pós-login (`next`) só aceita caminho interno.
- Testado contra o projeto real: proteção de rotas, validação, acessibilidade e senha errada (`E2E_AUTH_NETWORK=1`). **Não testados**: cadastro com e-mail de confirmação e link de acesso (exigem criar usuário e enviar e-mail).
- Não implementado: recuperação de senha, e-mails de confirmação personalizados, URLs de redirecionamento no painel do Supabase (`/auth/callback`).

## Leitura do banco pelas telas (Fase 2, etapa 3)

- `lib/data/index.ts` escolhe a fonte por requisição: Supabase (dados do usuário logado, com RLS) quando a autenticação está configurada; dados de exemplo caso contrário. Telas e regras não sabem qual está em uso.
- Períodos reais: Hoje, Ontem, 7 dias e 30 dias, em America/Sao_Paulo, com variação contra o período anterior de mesma duração. Sem base de comparação a variação é `—`, nunca um número inventado. "Personalizado" ainda não existe.
- Estados vazios: nenhuma oferta, oferta sem dados, nenhuma integração conectada, nenhuma sincronização.
- `/ofertas/nova` cria a oferta com a sessão do usuário (a RLS define o dono). Faltam o nicho (sem coluna ainda), o script de rastreamento e a escolha de conta e pixel do Meta.
- Nova view `campaign_daily_sales` (migração `20261018150000`), aplicada ao projeto.
- **Verificado**: montagem das linhas, datas, variações e views (testes unitários e Postgres local).
- **Ainda não verificado de ponta a ponta com dados reais**: o fluxo logado (cadastrar oferta e ver números semeados) precisa de um usuário de teste. O teste existe em `e2e/real.spec.ts` e fica pulado sem `E2E_REAL_EMAIL` e `E2E_REAL_PASSWORD`.
