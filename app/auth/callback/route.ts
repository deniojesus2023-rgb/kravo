import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';

/** Destino dos links enviados por e-mail (confirmação de conta e link de acesso). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get('next'));
  const failure = NextResponse.redirect(`${origin}/login?erro=link`);

  const supabase = await createClient();
  if (!supabase) return failure;

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error('sem código') };

  return error ? failure : NextResponse.redirect(`${origin}${next}`);
}
