# Notificações (push)

**Implementado e testado só com envio simulado.** Nenhuma notificação real foi enviada ainda.

## O que avisa
- **Por pedido:** venda aprovada, Pix gerado, boleto gerado, reembolso, chargeback. Cada tipo liga e desliga em Configurações.
- **Resumos do dia:** manhã (08h, fechamento de ontem), tarde (14h, hoje até agora), noite (20h, hoje), em America/Sao_Paulo.
- Opção "esconder valores": o texto aparece na tela bloqueada, então pode sair sem dinheiro. Contagens e ROAS continuam.

## Como funciona
- **App instalável (PWA):** `app/manifest.ts`, `public/sw.js` (só recebe push e abre o app; sem cache), ícones em `public/icons/`. `manifest`, `sw.js` e ícones abrem sem login (`proxy.ts`).
- **Aparelho:** em Configurações o usuário toca em "Ativar neste aparelho" (a permissão só pode ser pedida num toque). O navegador gera a inscrição; o servidor guarda em `push_subscriptions` (RLS; o endpoint é único: trocar de conta move o aparelho).
- **iPhone:** o push só existe com a trakfy instalada na tela inicial (Safari, Compartilhar, Adicionar à Tela de Início), iOS 16.4 ou mais novo. A tela mostra esse passo a passo quando detecta iPhone fora do app instalado.
- **Pedidos:** a leitura de vendas da Kiwify (webhook-aviso, botão ou agendador diário) compara cada pedido com o estado já conhecido (`orders.status`). Mudança relevante gera um aviso em `notifications`, **uma vez** (chave `user_id + dedupe_key`: `venda:<pedido>`, `pix:<pedido>`, `reembolso:<pedido>`...). Na **primeira leitura** nada avisa (seriam 90 dias de pedidos antigos) e eventos com mais de 48 h também não.
- **Resumos:** `GET /api/jobs/resumo?slot=manha|tarde|noite` (Bearer `CRON_SECRET`). Chave `resumo:<dia>:<período>`: disparar duas vezes não duplica. Lucro e ROAS real só contam ofertas com a Kiwify conectada **e** o produto ligado; sem elas o resumo diz o que falta.
- **Sem aparelho ativo nada é gravado**, para quem ativar depois não receber um histórico antigo de uma vez. Aparelho que revogou (404/410) é removido. O que fica em `notifications.error` é um código fixo (`push_erro`, `sem_aparelho`), nunca a mensagem do serviço de push.

## O que falta para funcionar de verdade (ação do dono)
1. Gerar as chaves VAPID: `npx web-push generate-vapid-keys`. Na Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (a privada nunca em chat nem no repositório). Redeploy.
2. Agendar os resumos: `supabase/agendamentos/resumos.sql` (pg_cron + pg_net do Supabase; a Vercel gratuita só roda uma vez por dia). Trocar os dois `[ASSIM]` e executar no SQL Editor.
3. **Reconectar a Kiwify** para o webhook passar a incluir `pix_gerado` e `boleto_gerado`.
4. Instalar a trakfy na tela inicial do iPhone, abrir Configurações, ativar e tocar em "Enviar teste".

## Não validado
Entrega real de push (Apple/Google), o comportamento no iPhone, o valor real de `payment_method` da Kiwify para Pix e boleto, e a criação do webhook com os novos eventos. Dependem de um pedido real.
