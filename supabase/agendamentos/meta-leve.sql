-- trakfy: leitura leve do gasto e das métricas de HOJE do Meta, a cada 5 minutos.
-- NÃO é uma migração: não roda sozinho. Execute no SQL Editor do Supabase DEPOIS de trocar os dois valores [ASSIM].
--   [ASSIM: https://seu-dominio]  → o endereço público do app (o mesmo de APP_URL)
--   [ASSIM: CRON_SECRET]          → o mesmo valor da variável CRON_SECRET na Vercel
-- Requer as extensões pg_cron e pg_net. NUNCA salve o valor real do segredo neste arquivo nem no repositório:
-- troque só na janela do SQL Editor, na hora de executar.
--
-- O endereço responde na hora (202) e lê em segundo plano. A leitura leve só atualiza as campanhas que você já ligou a uma
-- oferta (uma chamada ao Meta por conta). A leitura completa continua diária (Vercel) e no botão "Sincronizar agora".

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('trakfy-meta-leve', '*/5 * * * *', $$
  select net.http_get(url := '[ASSIM: https://seu-dominio]/api/jobs/sync-meta?modo=leve',
    headers := jsonb_build_object('Authorization', 'Bearer [ASSIM: CRON_SECRET]'),
    timeout_milliseconds := 30000);
$$);

-- Para remover: select cron.unschedule('trakfy-meta-leve');
