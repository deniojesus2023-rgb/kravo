import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createCapi } from '@/lib/capi/graph';
import { processQueue } from '@/lib/capi/queue';
import { supabaseCapiStore } from '@/lib/capi/store';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Reenvia à API de Conversões o que ficou pendente. Chamado pelo agendador (Bearer CRON_SECRET). Devolve só contagens. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'nao_configurado' }, { status: 503 });
  try {
    const capi = createCapi();
    const result = await processQueue({ store: supabaseCapiStore(admin), send: (i) => capi.sendEvents(i), now: new Date() });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'falha_na_fila' }, { status: 500 });
  }
}
