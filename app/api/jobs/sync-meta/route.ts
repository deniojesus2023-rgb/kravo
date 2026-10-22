import { timingSafeEqual } from 'node:crypto';
import { after, NextResponse, type NextRequest } from 'next/server';
import { getMetaEnv } from '@/lib/meta/config';
import { createGraph } from '@/lib/meta/graph';
import { runMetaSync } from '@/lib/meta/run';
import { supabaseRunDb, usersToSync } from '@/lib/meta/sync-store';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Chamada pelo agendador da Vercel (Authorization: Bearer CRON_SECRET). Devolve só contagens. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  const env = getMetaEnv();
  const admin = createAdminClient();
  if (!env || !admin) return NextResponse.json({ error: 'nao_configurado' }, { status: 503 });

  const graph = createGraph(env);
  const db = supabaseRunDb(admin);

  // ?modo=leve (agendador de poucos minutos): responde logo e lê só as métricas de hoje em segundo plano.
  if (request.nextUrl.searchParams.get('modo') === 'leve') {
    after(async () => {
      for (const userId of await usersToSync(admin).catch(() => [])) {
        await runMetaSync({ userId, graph, db, mode: 'leve' }).catch(() => undefined);
      }
    });
    return NextResponse.json({ aceito: true, modo: 'leve' }, { status: 202 });
  }

  let users = 0;
  let ok = 0;
  let failed = 0;
  for (const userId of await usersToSync(admin)) {
    users += 1;
    try {
      const outcome = await runMetaSync({ userId, graph, db });
      if (outcome.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return NextResponse.json({ users, ok, failed });
}
