# API de Conversões (Meta)

Envia ao pixel de cada oferta as vendas **aprovadas** da plataforma de vendas, para o Meta otimizar pelo que vendeu de fato.
Implementada e testada **só com a Graph simulada**; nenhum evento real foi enviado.

## Como funciona
- Um pixel por oferta (`offer_pixels`): ID do pixel, token da API de Conversões (cifrado em `connection_secrets.offer_id`) e código opcional de "Eventos de teste".
- Cada `venda_aprovada` de oferta com envio **ligado** entra na fila `capi_events` (chave única `usuário + oferta + evento + event_id`; repetir o pedido não duplica).
- `event_id` = ID do pedido. `Purchase`, `action_source: website`, valor em reais, BRL, `order_id`.
- Dados do comprador só em hash SHA-256 (e-mail, telefone com 55, nome, cidade, estado, CEP, país). **CPF nunca é enviado.** Nada em claro é guardado.
- Envio logo após a venda (webhook/leitura) e reenvio pelo agendador `/api/jobs/capi-fila` (Bearer `CRON_SECRET`, a cada 5 min; linha em `supabase/agendamentos/meta-leve.sql`).
- Tentativas: esperas de 1, 2, 5, 15, 30, 60, 60 e 60 min; desiste após 8 tentativas ou 6 h. Evento com mais de ~7 dias é descartado (o Meta recusa).
- Token recusado (códigos 190 e família) marca o pixel como "Token recusado" e para; erros ficam como código curto, nunca a mensagem do Meta.

## Duplicidade (importante)
O checkout da Kiwify pode ter o próprio pixel disparando `Purchase`. Ligar o envio sem tratar isso conta a venda duas vezes.
Por isso o envio **nasce desligado** e só liga com a confirmação de que o Purchase do checkout está desligado ou usa o mesmo ID do pedido. Trocar o ID do pixel desliga o envio.

## Para usar
1. Gerenciador de Eventos → pixel da oferta → Configurações → gerar token da API de Conversões.
2. Rastreamento da oferta: colar ID do pixel, token e o código de "Eventos de teste".
3. "Enviar evento de teste" (usa o seu e-mail em hash) e conferir em "Eventos de teste".
4. Confirmar a duplicidade e ligar o envio; tirar o código de teste para os eventos passarem a valer.

## Falta
Pix/boleto como `AddPaymentInfo` (coluna `send_pix` já existe, desligada), indicador de qualidade de correspondência e captura de `fbclid`.
