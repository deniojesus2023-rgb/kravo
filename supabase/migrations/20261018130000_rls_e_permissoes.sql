-- kavro: isolamento por usuário (RLS) e permissões mínimas.
--
-- Duas camadas, ambas obrigatórias:
-- 1. GRANT: o que o navegador (papel authenticated) pode fazer em cada tabela.
--    Métricas, pedidos, eventos e sincronizações só são escritos pelo servidor (service_role),
--    porque a kavro lê métricas e envia eventos; o usuário não pode forjar esses números.
-- 2. RLS: dentro do que o GRANT permite, cada usuário só enxerga e altera as próprias linhas.

-- Nada é público por padrão, nem em tabelas criadas no futuro por este papel.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: user_id = usuário autenticado
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'meta_connections', 'sales_connections', 'ad_accounts', 'offers', 'pixels', 'creatives',
    'campaigns', 'adsets', 'ads', 'daily_metrics', 'orders', 'tracking_events', 'sync_runs', 'alerts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_dono', t
    );
  end loop;
end
$$;

alter table public.profiles enable row level security;
create policy profiles_dono on public.profiles for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Credenciais cifradas: RLS ligada e nenhuma política, nenhum GRANT.
-- Só o service_role (que ignora RLS) lê e escreve, nunca o navegador.
alter table public.connection_secrets enable row level security;

-- ---------------------------------------------------------------------------
-- GRANT: o navegador
-- ---------------------------------------------------------------------------
grant select, update (name, locale) on public.profiles to authenticated;

-- Escrita pelo usuário: ofertas (cadastro e limites de decisão).
grant select, insert, update, delete on public.offers to authenticated;

-- Escrita limitada a uma coluna: vínculos e seleções feitos na interface.
grant select on public.ad_accounts, public.pixels, public.creatives, public.campaigns, public.alerts to authenticated;
grant update (selected) on public.ad_accounts to authenticated;
grant update (offer_id) on public.pixels, public.creatives, public.campaigns to authenticated;
grant update (resolved_at) on public.alerts to authenticated;

-- Somente leitura: dados que vêm do Meta, das plataformas de venda e do servidor.
grant select on
  public.meta_connections, public.sales_connections, public.adsets, public.ads,
  public.daily_metrics, public.orders, public.tracking_events, public.sync_runs
to authenticated;
