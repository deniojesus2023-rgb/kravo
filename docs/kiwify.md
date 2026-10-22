# Kiwify

Fonte: <https://docs.kiwify.com.br> (lida em 2026-10-19). **Ainda não validada com uma conta real.**

## Como conecta

- Base `https://public-api.kiwify.com/v1`. `POST /oauth/token` (formulário `client_id` + `client_secret`) devolve um Bearer de 24 h. Toda chamada leva `Authorization: Bearer` e `x-kiwify-account-id`. Limite: 100 chamadas por minuto.
- O usuário cola `client_id`, `client_secret` e o ID da conta em Integrações. Ficam cifrados (AES-256-GCM) em `connection_secrets` e nunca voltam para a tela nem vão para o log. A conexão só é aceita depois de `oauth/token` e `GET /products` funcionarem.
- A trakfy cria um webhook na conta da Kiwify (`POST /webhooks`, todos os produtos, eventos `compra_aprovada`, `compra_reembolsada`, `chargeback`, `subscription_renewed`). Se não conseguir, a conexão vale mesmo assim e a leitura roda uma vez por dia.

## Dois modos de conexão

- **URL (mais simples, `mode = 'webhook'`):** a trakfy gera a URL (`/api/webhooks/kiwify/<segredo>`, 192 bits aleatórios; só o hash fica em `sales_connections.webhook_secret_hash` e o segredo cifrado em `connection_secrets`, para a tela poder mostrar a URL de novo). O usuário cola a URL em Apps, Webhooks, na Kiwify, e os dados vêm no **corpo do aviso**. Sem chave de API e **sem histórico** (só vendas novas). "Gerar nova URL" invalida a antiga.
- **Chave de API (`mode = 'api'`):** descrito abaixo; traz 90 dias de histórico e recupera avisos perdidos.

### Modo URL: leitura do corpo (`lib/kiwify/webhook-payload.ts`)

A documentação pública **não descreve o corpo do aviso**. A leitura é tolerante (maiúsculas ou minúsculas, vários nomes: `order_id`, `order_status`, `webhook_event_type`, `Product`, `Commissions.charge_amount`, `TrackingParameters`...) e estrita no que importa: sem id, status reconhecido, produto e valor, o aviso é **ignorado** e a tela diz o motivo. Nunca se inventa valor.
- Valor: inteiro = centavos; texto com vírgula ou ponto decimal = reais; outra forma = desconhecido. Sem moeda no aviso vale BRL; moeda informada ≠ BRL é ignorada.
- Datas: só valem com fuso explícito; sem fuso (hora ambígua), vale o instante em que o aviso chegou (a Kiwify avisa em segundos). Aviso repetido não muda nada. Reembolso mantém a data de aprovação já gravada.
- A tela mostra o último aviso recebido (quando e o que a trakfy fez) e a **estrutura** dele com nomes, e-mails, CPF e telefones trocados por marcadores (`sanitizePayload`). Os produtos vistos nos avisos (`sales_connections.webhook_products`) alimentam a lista para ligar cada oferta a um produto; um produto só aparece depois do primeiro aviso dele, e esse primeiro pedido não é gravado (sem oferta ligada).
- Os testes usam avisos **montados** no formato mais provável, não avisos reais. **Primeiro teste real:** gerar a URL, criar o webhook na Kiwify, enviar um teste e conferir "O que a trakfy fez". Se vier "ignorado", copiar a estrutura mostrada na tela para corrigir a leitura.

## Como os dados entram (modo chave de API)

- **O webhook é só um aviso.** O corpo é ignorado (a documentação pública não descreve o corpo nem como a Kiwify autentica a chamada). O endereço `/api/webhooks/kiwify/<segredo>` leva 192 bits aleatórios; só o hash fica em `sales_connections.webhook_secret_hash`. Segredo desconhecido: 404. Ao receber, a trakfy lê `GET /sales` (com `view_full_sale_details=true`) e grava os pedidos.
- **Leitura de segurança:** `/api/jobs/sync-vendas` diário (`vercel.json`, `CRON_SECRET`) e botão "Ler vendas agora" (mínimo 2 min entre leituras). Primeira leitura: 90 dias (limite da API). Depois: só o que mudou (`updated_at_start_date`). Um reembolso de venda com mais de 90 dias não é visto.
- Cada leitura grava uma linha em `sync_runs` (`source = 'Kiwify'`) com código fixo de erro (`credencial_invalida`, `limite_da_kiwify`, `kiwify_erro`, `banco`). Credencial recusada marca a conexão como `erro`.

## Regras dos pedidos

- Valor = `payment.charge_amount` (o que o cliente pagou), em BRL. Outra moeda é ignorada e contada, nunca convertida. Taxa (`payment.fee`) e líquido (`net_amount`) existem na API, mas não entram: taxas e custos ainda não são cadastrados (fórmula do lucro).
- `paid`, `approved`, `refund_requested` e `pending_refund` → aprovado. `refunded` → reembolsado e `chargedback` → chargeback (valor todo). `refused` → cancelado. `pending`, `processing`, `waiting_payment`, `authorized` → pendente. Status novo: ignorado e contado.
- Sem `approved_date`, a data de criação vale (o banco exige data de aprovação).
- **Oferta ↔ produto:** `offers.sales_product_id`, escolhido em Integrações. Pedido de produto sem oferta não é gravado. **Oferta sem produto ligado continua com lucro e ROAS real desconhecidos** (nunca "Pausar" por falta de pedidos).
- **Campanha e anúncio:** ids numéricos longos nas UTMs (`utm_campaign`, `utm_content`) são comparados com `campaigns.meta_campaign_id` e `ads.meta_ad_id`. Padrão mostrado em Nova oferta: `utm_campaign={{campaign.name}}|{{campaign.id}}`, `utm_content={{ad.name}}|{{ad.id}}` e `utm_term={{adset.name}}|{{adset.id}}`.

## Não validado

Formato de data aceito por `start_date`/`end_date`, tamanho máximo de `page_size`, valores reais de `status` e `tracking` em vendas reais, e criação do webhook. O primeiro teste real é: conectar, ligar a oferta ao produto e clicar em "Ler vendas agora".
