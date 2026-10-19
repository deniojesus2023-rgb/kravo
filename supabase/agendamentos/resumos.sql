-- trakfy: agenda dos resumos do dia (08h, 14h e 20h em America/Sao_Paulo = 11h, 17h e 23h UTC).
-- NÃO é uma migração: não roda sozinho. Execute no SQL Editor do Supabase DEPOIS de trocar os dois valores [ASSIM].
--   [ASSIM: https://seu-dominio]  → o endereço público do app (o mesmo de APP_URL)
--   [ASSIM: CRON_SECRET]          → o mesmo valor da variável CRON_SECRET na Vercel
-- Requer as extensões pg_cron e pg_net (Database > Extensions). O segredo fica guardado dentro da tarefa agendada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('trakfy-resumo-manha', '0 11 * * *', $$
  select net.http_get(url := '[ASSIM: https://seu-dominio]/api/jobs/resumo?slot=manha',
    headers := jsonb_build_object('Authorization', 'Bearer [ASSIM: CRON_SECRET]'));
$$);

select cron.schedule('trakfy-resumo-tarde', '0 17 * * *', $$
  select net.http_get(url := '[ASSIM: https://seu-dominio]/api/jobs/resumo?slot=tarde',
    headers := jsonb_build_object('Authorization', 'Bearer [ASSIM: CRON_SECRET]'));
$$);

select cron.schedule('trakfy-resumo-noite', '0 23 * * *', $$
  select net.http_get(url := '[ASSIM: https://seu-dominio]/api/jobs/resumo?slot=noite',
    headers := jsonb_build_object('Authorization', 'Bearer [ASSIM: CRON_SECRET]'));
$$);

-- Para remover: select cron.unschedule('trakfy-resumo-manha'); (idem tarde e noite).
