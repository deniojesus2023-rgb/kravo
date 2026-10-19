import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createKiwify } from '@/lib/kiwify/client';
import { runKiwifySync } from '@/lib/kiwify/run';
import { kiwifyUsers, supabaseKiwifyRunDb } from '@/lib/kiwify/store';
import { orderNotifier } from '@/lib/notifications/notifier';
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

/** Leitura periódica de segurança (a Vercel envia Authorization: Bearer CRON_SECRET). Devolve só contagens. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'nao_configurado' }, { status: 503 });

  const kiwify = createKiwify();
  const db = supabaseKiwifyRunDb(admin);
  let users = 0;
  let ok = 0;
  let failed = 0;
  for (const userId of await kiwifyUsers(admin)) {
    users += 1;
    try {
      const outcome = await runKiwifySync({ userId, kiwify, db, notify: orderNotifier(admin) });
      if (outcome.ok) ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return NextResponse.json({ users, ok, failed });
}
