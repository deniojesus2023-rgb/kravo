import { after, NextResponse } from 'next/server';
import { createKiwify } from '@/lib/kiwify/client';
import { runKiwifySync } from '@/lib/kiwify/run';
import { supabaseKiwifyRunDb } from '@/lib/kiwify/store';
import { handleKiwifyWebhook } from '@/lib/kiwify/webhook';
import { orderNotifier } from '@/lib/notifications/notifier';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Aviso da Kiwify (venda aprovada, reembolso, chargeback...). Responde logo e lê as vendas em seguida. */
export async function POST(_request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const admin = createAdminClient();
  if (!admin) return new NextResponse(null, { status: 503 });
  const db = supabaseKiwifyRunDb(admin);
  const kiwify = createKiwify();

  const result = await handleKiwifyWebhook((await params).secret, {
    async findUserByHash(hash) {
      const { data } = await admin.from('sales_connections').select('user_id').eq('webhook_secret_hash', hash).eq('platform', 'Kiwify').eq('status', 'conectado').maybeSingle();
      return (data?.user_id as string | undefined) ?? null;
    },
    sync: (userId) => runKiwifySync({ userId, kiwify, db, minIntervalSeconds: 3, notify: orderNotifier(admin) }),
    defer: (task) => after(task),
  });
  return new NextResponse(null, { status: result.status });
}

