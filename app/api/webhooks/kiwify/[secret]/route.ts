import { after, NextResponse } from 'next/server';
import { createKiwify } from '@/lib/kiwify/client';
import { runKiwifySync } from '@/lib/kiwify/run';
import { findWebhookConnection, recordWebhookReceipt, supabaseKiwifyRunDb, supabaseOrderStore } from '@/lib/kiwify/store';
import { handleKiwifyWebhook } from '@/lib/kiwify/webhook';
import { processWebhookBody } from '@/lib/kiwify/webhook-sale';
import { orderNotifier } from '@/lib/notifications/notifier';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 200_000;

/** Aviso da Kiwify (venda aprovada, Pix gerado, reembolso...). Responde logo e processa em seguida. */
export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const admin = createAdminClient();
  if (!admin) return new NextResponse(null, { status: 503 });
  const db = supabaseKiwifyRunDb(admin);
  const kiwify = createKiwify();
  const notify = orderNotifier(admin);

  // Corpo pequeno e em JSON; qualquer outra coisa vira "corpo inválido" (o aviso é registrado, nada é gravado).
  let body: unknown = null;
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length <= MAX_BODY_BYTES) {
    const text = await request.text().catch(() => '');
    if (text.length <= MAX_BODY_BYTES) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
  }

  const result = await handleKiwifyWebhook((await params).secret, body, {
    findConnection: (hash) => findWebhookConnection(admin, hash),
    sync: (userId) => runKiwifySync({ userId, kiwify, db, minIntervalSeconds: 3, notify }),
    async receive(connection, payload) {
      const now = new Date();
      const store = supabaseOrderStore(admin, connection.userId, connection.connectionId);
      const out = await processWebhookBody({ body: payload, store, now }).catch(() => null);
      await recordWebhookReceipt(admin, connection.userId, connection.connectionId, {
        at: now.toISOString(),
        sample: out?.sample ?? null,
        event: out?.event ?? null,
        result: out ? (out.outcome.kind === 'ignorado' ? `ignorado:${out.outcome.reason}` : out.outcome.kind) : 'erro',
        product: out?.product ?? null,
      }).catch(() => undefined);
      if (out && out.events.length > 0) await notify(connection.userId, out.events).catch(() => undefined);
    },
    defer: (task) => after(task),
  });
  return new NextResponse(null, { status: result.status });
}
