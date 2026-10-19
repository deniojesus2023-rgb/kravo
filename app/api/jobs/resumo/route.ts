import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { saoPauloDate } from '@/lib/data/dates';
import { notifyMessage } from '@/lib/notifications/dispatch';
import { formatSummary, SUMMARY_PREFERENCE, type SummarySlot } from '@/lib/notifications/format';
import { collectSummary, supabaseNotifyDeps, usersWithDevices } from '@/lib/notifications/store';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const SLOTS: SummarySlot[] = ['manha', 'tarde', 'noite'];

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Resumo do dia por push. Chamado pelo agendador (Authorization: Bearer CRON_SECRET) com ?slot=manha|tarde|noite. Devolve só contagens. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  const slot = request.nextUrl.searchParams.get('slot') as SummarySlot | null;
  if (!slot || !SLOTS.includes(slot)) return NextResponse.json({ error: 'slot_invalido' }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'nao_configurado' }, { status: 503 });

  const deps = supabaseNotifyDeps(admin);
  const now = new Date();
  let users = 0;
  let sent = 0;
  let failed = 0;
  for (const userId of await usersWithDevices(admin)) {
    try {
      const prefs = await deps.preferences(userId);
      if (!prefs[SUMMARY_PREFERENCE[slot]]) continue;
      users += 1;
      const message = formatSummary(slot, await collectSummary(admin, userId, slot, now), prefs.hide_amounts);
      // Chave por dia e período: o agendador disparando duas vezes não duplica o resumo.
      const result = await notifyMessage(userId, 'resumo', `resumo:${saoPauloDate(now)}:${slot}`, message, deps);
      sent += result.delivered;
    } catch {
      failed += 1;
    }
  }
  return NextResponse.json({ users, sent, failed });
}
