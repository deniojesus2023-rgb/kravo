# Kiwify

Fonte: <https://docs.kiwify.com.br> (lida em 2026-10-19). **Ainda não validada com uma conta real.**

## Como conecta

- Base `https://public-api.kiwify.com/v1`. `POST /oauth/token` (formulário `client_id` + `client_secret`) devolve um Bearer de 24 h. Toda chamada leva `Authorization: Bearer` e `x-kiwify-account-id`. Limite: 100 chamadas por minuto.
- O usuário cola `client_id`, `client_secret` e o ID da conta em Integrações. Ficam cifrados (AES-256-GCM) em `connection_secrets` e nunca voltam para a tela nem vão para o log. A conexão só é aceita depois de `oauth/token` e `GET /products` funcionarem.
- A trakfy cria um webhook na conta da Kiwify (`POST /webhooks`, todos os produtos, eventos `compra_aprovada`, `compra_reembolsada`, `chargeback`, `subscription_renewed`). Se não conseguir, a conexão vale mesmo assim e a leitura roda uma vez por dia.

## Como os dados entram

- **O webhook é só um aviso.** O corpo é ignorado (a documentação pública não descreve o corpo nem como a Kiwify autentica a chamada). O endereço `/api/webhooks/kiwify/<segredo>` leva 192 bits aleatórios; só o hash fica em `sales_connections.webhook_secret_hash`. Segredo desconhecido: 404. Ao receber, a trakfy lê `GET /sales` (com `view_full_sale_details=true`) e grava os pedidos.
- **Leitura de segurança:** `/api/jobs/sync-vendas` diário (`vercel.json`, `CRON_SECRET`) e botão "Ler vendas agora" (mínimo 2 min entre leituras). Primeira leitura: 90 dias (limite da API). Depois: só o que mudou (`updated_at_start_date`). Um reembolso de venda com mais de 90 dias não é visto.
- Cada leitura grava uma linha em `sync_runs` (`source = 'Kiwify'`) com código fixo de erro (`credencial_invalida`, `limite_da_kiwify`, `kiwify_erro`, `banco`). Credencial recusada marca a conexão como `erro`.

## Regras dos pedidos

- Valor = `payment.charge_amount` (o que o cliente pagou), em BRL. Outra moeda é ignorada e contada, nunca convertida. Taxa (`payment.fee`) e líquido (`net_amount`) existem na API, mas não entram: taxas e custos ainda não são cadastrados (fórmula do lucro).
- `paid`, `approved`, `refund_requested` e `pending_refund` → aprovado. `refunded` → reembolsado e `chargedback` → chargeback (valor todo). `refused` → cancelado. `pending`, `processing`, `waiting_payment`, `authorized` → pendente. Status novo: ignorado e contado.
- Sem `approved_date`, a data de criação vale (o banco exige data de aprovação).
- **Oferta ↔ produto:** `offers.sales_product_id`, escolhido em Integrações. Pedido de produto sem oferta não é gravado. **Oferta sem produto ligado continua com lucro e ROAS real desconhecidos** (nunca "Pausar" por falta de pedidos).
- **Campanha e anúncio:** ids numéricos longos nas UTMs (`utm_campaign`, `utm_content`) são comparados com `campaigns.meta_campaign_id` e `ads.meta_ad_id`. Padrão recomendado nos anúncios: `utm_campaign={{campaign.name}}|{{campaign.id}}` e `utm_content={{ad.name}}|{{ad.id}}`.

## Não validado

Formato de data aceito por `start_date`/`end_date`, tamanho máximo de `page_size`, valores reais de `status` e `tracking` em vendas reais, e criação do webhook. O primeiro teste real é: conectar, ligar a oferta ao produto e clicar em "Ler vendas agora".
