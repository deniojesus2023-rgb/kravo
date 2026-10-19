-- trakfy: integração com a Kiwify.
-- Um produto da plataforma de vendas corresponde a uma oferta; sem isso não há como saber a que oferta um pedido pertence.
alter table public.offers
  add column sales_product_id text check (sales_product_id is null or sales_product_id ~ '^[A-Za-z0-9_-]{6,64}$');

create unique index offers_user_platform_product
  on public.offers (user_id, sales_platform, sales_product_id)
  where sales_product_id is not null;

-- O endereço do webhook leva um segredo aleatório; aqui fica só o hash, para achar o dono do webhook.
alter table public.sales_connections add column webhook_secret_hash text;

create unique index sales_connections_webhook_secret_hash
  on public.sales_connections (webhook_secret_hash)
  where webhook_secret_hash is not null;

-- Uma conexão por plataforma e usuário.
create unique index sales_connections_user_platform on public.sales_connections (user_id, platform);
