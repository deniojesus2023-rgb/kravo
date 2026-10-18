import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { appOrigin, getMetaEnv, metaRedirectUri } from '@/lib/meta/config';
import { completeMetaConnection } from '@/lib/meta/flow';
import { createGraph } from '@/lib/meta/graph';
import { statesMatch, STATE_COOKIE } from '@/lib/meta/oauth';
import { supabaseConnectionStore } from '@/lib/meta/store';
import { parseKey } from '@/lib/crypto/secret';
import { diagnosticParams, failureLogEntry } from '@/lib/meta/diagnostic';

/** Retorno do login. Valida o `state`, conclui a conexão e volta para Integrações com um código de resultado. */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const finish = (code: string, extra: Record<string, string> = {}) => {
    const query = new URLSearchParams({ meta: code, ...extra });
    const response = NextResponse.redirect(`${origin}/integracoes?${query}`);
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/meta' });
    return response;
  };

  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.redirect(`${origin}/login?next=/integracoes`);

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return finish('negado'); // o usuário cancelou ou negou no diálogo
  if (!statesMatch(request.cookies.get(STATE_COOKIE)?.value, params.get('state'))) return finish('estado_invalido');

  const code = params.get('code');
  const env = getMetaEnv();
  const admin = createAdminClient();
  if (!code || !env) return finish('nao_configurado');
  try {
    parseKey(process.env.TOKEN_ENCRYPTION_KEY);
  } catch {
    return finish('nao_configurado');
  }
  if (!admin) return finish('nao_configurado');

  const result = await completeMetaConnection(
    { graph: createGraph(env), store: supabaseConnectionStore(admin) },
    { userId: user.id, code, redirectUri: metaRedirectUri(origin) },
  );
  if (!result.ok) {
    // Vai para os logs do servidor (ex.: Vercel). Campos escolhidos, sem token, código do login, state, segredo ou corpo bruto.
    console.error(JSON.stringify(failureLogEntry(result, env)));
  }
  return result.ok ? finish('ok') : finish(result.reason, diagnosticParams(result.diagnostic));
}
