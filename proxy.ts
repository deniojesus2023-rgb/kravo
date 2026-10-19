import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/redirect';
import { getSupabaseEnv } from '@/lib/supabase/env';

const PUBLIC_PATHS = ['/login', '/cadastro', '/auth', '/privacidade', '/termos', '/exclusao-de-dados', '/api/jobs'];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Renova a sessão do Supabase a cada requisição e protege as telas.
 * Sem Supabase configurado não faz nada: o app roda só com dados de exemplo.
 */
export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims valida o JWT; sem cookie de sessão não faz chamada de rede.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', safeNext(pathname + search));
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === '/login' || pathname === '/cadastro')) {
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get('next'));
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
