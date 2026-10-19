-- trakfy: conexão da Kiwify só por URL de webhook (sem chave de API).
-- 'api'     = chave de API cifrada; o webhook só avisa e os dados vêm de GET /sales (modo original).
-- 'webhook' = a trakfy gera a URL, o usuário cola no painel da Kiwify e os dados vêm no corpo do aviso.
alter table public.sales_connections
  add column mode text not null default 'api' check (mode in ('api', 'webhook')),
  -- Último aviso recebido: quando, e a estrutura SEM dados pessoais (valores de texto trocados por marcadores).
  add column last_webhook_at timestamptz,
  add column last_webhook_sample jsonb check (last_webhook_sample is null or jsonb_typeof(last_webhook_sample) = 'object'),
  -- Produtos vistos nos avisos (id → nome), para ligar cada oferta a um produto sem precisar da API.
  add column webhook_products jsonb not null default '{}'::jsonb check (jsonb_typeof(webhook_products) = 'object');
