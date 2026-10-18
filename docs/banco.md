# Banco de dados (Fase 2, etapa 1)

Migrações em `supabase/migrations/`, aplicadas em ordem. Testadas num Postgres local (PGlite) com `pnpm test`; **ainda não foram aplicadas a um projeto Supabase real**.

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
