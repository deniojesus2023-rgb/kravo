import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { appOrigin, getMetaEnv, metaRedirectUri } from '@/lib/meta/config';
import { buildLoginUrl, newState, STATE_COOKIE, STATE_MAX_AGE_SECONDS } from '@/lib/meta/oauth';

/** Início do login com o Facebook. Exige sessão da trakfy e guarda um `state` aleatório num cookie. */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const back = (code: string) => NextResponse.redirect(`${origin}/integracoes?meta=${code}`);

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.redirect(`${origin}/login?next=/integracoes`);

  const env = getMetaEnv();
  if (!env) return back('nao_configurado');

  const state = newState();
  const response = NextResponse.redirect(buildLoginUrl(env, metaRedirectUri(origin), state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/meta',
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return response;
}
