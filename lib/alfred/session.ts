import 'server-only';
import { cache } from 'react';
import { chatStatus } from './config';
import { createClient } from '@/lib/supabase/server';

/** Sessão do Alfred por requisição: cliente do usuário, e-mail e se o chat está disponível. */
export const getAlfredSession = cache(async () => {
  const supabase = await createClient();
  const claims = supabase ? (await supabase.auth.getClaims()).data?.claims : null;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  const status = chatStatus({ supabase: Boolean(supabase), signedIn: Boolean(userId) });
  return { supabase, userId, email, status };
});
