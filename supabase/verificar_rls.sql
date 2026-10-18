-- Verifica o isolamento por usuário num banco real. Seguro: cria dois usuários temporários
-- e termina SEMPRE em exceção, o que desfaz tudo. O resultado vem na mensagem de erro.
-- Esperado: perfis=2; A ve ofertas=1; A ve oferta de B=0; e todos os "bloqueado (42501)".
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  oa uuid; ob uuid; sa uuid; n int; r text := '';
begin
  insert into auth.users (id, email) values (a, 'a@teste.invalid'), (b, 'b@teste.invalid');
  select count(*) into n from public.profiles where id in (a, b);
  r := r || 'perfis criados pelo gatilho=' || n || '; ';

  insert into public.offers (user_id, name, code, sales_platform, price_cents) values (a, 'Oferta A', 'AAA', 'Kiwify', 14990) returning id into oa;
  insert into public.offers (user_id, name, code, sales_platform, price_cents) values (b, 'Oferta B', 'BBB', 'Kiwify', 14990) returning id into ob;
  insert into public.sales_connections (user_id, platform) values (a, 'Kiwify') returning id into sa;
  insert into public.orders (user_id, offer_id, sales_connection_id, platform_order_id, status, amount_cents, approved_at) values (a, oa, sa, 'p1', 'aprovado', 14990, '2026-10-17T23:30:00-03:00');
  insert into public.connection_secrets (user_id, sales_connection_id, ciphertext) values (a, sa, 'x');

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.offers; r := r || 'A ve ofertas=' || n || '; ';
  select count(*) into n from public.offers where id = ob; r := r || 'A ve oferta de B=' || n || '; ';
  select count(*) into n from public.offer_daily_sales; r := r || 'A ve dias de venda=' || n || '; ';

  begin insert into public.offers (user_id, name, code, sales_platform, price_cents) values (b, 'x', 'XXX', 'Kiwify', 1); r := r || 'FALHA: A inseriu em nome de B; ';
  exception when others then r := r || 'A inserir como B bloqueado (' || sqlstate || '); '; end;
  begin perform 1 from public.connection_secrets; r := r || 'FALHA: A leu segredos; ';
  exception when others then r := r || 'A ler segredos bloqueado (' || sqlstate || '); '; end;
  begin update public.orders set amount_cents = 1; r := r || 'FALHA: A alterou pedidos; ';
  exception when others then r := r || 'A alterar pedidos bloqueado (' || sqlstate || '); '; end;

  set local role anon;
  begin perform 1 from public.offers; r := r || 'FALHA: anon leu ofertas; ';
  exception when others then r := r || 'anon bloqueado (' || sqlstate || '); '; end;

  reset role;
  raise exception 'RESULTADO: %', r;
end $$;
