import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createKiwify } from './client';
import { openKiwifySecret, openWebhookSecret } from './store';

export interface KiwifyIntegration {
  status: 'nao_conectado' | 'conectado' | 'erro' | 'desconectado';
  webhookActive: boolean;
  lastSync: { finishedAt: string; ok: boolean } | null;
  offers: Array<{ id: string; name: string; code: string; productId: string | null }>;
  /** `null` = não foi possível listar agora (mostramos aviso, sem inventar). */
  products: Array<{ id: string; name: string }> | null;
  mode: 'api' | 'webhook';
  /** Modo URL: o endereço que o usuário cola na Kiwify. Só o dono vê (a tela é dele). */
  webhookUrl: string | null;
  /** Modo URL: último aviso recebido e o que a trakfy fez com ele. */
  lastWebhook: { at: string; event: string | null; result: string; shape: unknown } | null;
}

/** Estado da Kiwify para a tela de Integrações. O navegador não lê credenciais; os produtos vêm de uma chamada de servidor. */
export async function readKiwifyIntegration(supabase: SupabaseClient, admin: SupabaseClient | null, userId: string, origin: string | null): Promise<KiwifyIntegration> {
  const conn = await supabase
    .from('sales_connections')
    .select('id, status, mode, last_webhook_at, last_webhook_sample, webhook_products')
    .eq('platform', 'Kiwify')
    .limit(1);
  if (conn.error) throw new Error(`Falha ao ler sales_connections: ${conn.error.message}`);
  const row = conn.data?.[0];
  const empty: KiwifyIntegration = { status: 'nao_conectado', webhookActive: false, lastSync: null, offers: [], products: null, mode: 'api', webhookUrl: null, lastWebhook: null };
  if (!row) return empty;

  const [offers, runs] = await Promise.all([
    supabase.from('offers').select('id, name, code, sales_product_id').eq('sales_platform', 'Kiwify').neq('status', 'arquivada').order('created_at'),
    supabase.from('sync_runs').select('finished_at, ok').eq('source', 'Kiwify').not('finished_at', 'is', null).order('finished_at', { ascending: false }).limit(1),
  ]);
  if (offers.error) throw new Error(`Falha ao ler ofertas: ${offers.error.message}`);

  const result: KiwifyIntegration = {
    status: row.status,
    webhookActive: false,
    lastSync: runs.data?.[0] ? { finishedAt: runs.data[0].finished_at, ok: Boolean(runs.data[0].ok) } : null,
    offers: (offers.data ?? []).map((o) => ({ id: o.id, name: o.name, code: o.code, productId: o.sales_product_id })),
    products: null,
    mode: row.mode === 'webhook' ? 'webhook' : 'api',
    webhookUrl: null,
    lastWebhook: null,
  };

  if (result.mode === 'webhook') {
    const sample = row.last_webhook_sample as { event?: string | null; result?: string; shape?: unknown } | null;
    result.lastWebhook = row.last_webhook_at ? { at: row.last_webhook_at, event: sample?.event ?? null, result: sample?.result ?? 'desconhecido', shape: sample?.shape ?? null } : null;
    result.products = Object.entries((row.webhook_products as Record<string, string> | null) ?? {}).map(([id, name]) => ({ id, name: String(name) }));
    if (row.status === 'conectado' && admin && origin) {
      try {
        const secret = await admin.from('connection_secrets').select('ciphertext').eq('sales_connection_id', row.id).eq('user_id', userId).maybeSingle();
        if (secret.data) result.webhookUrl = `${origin}/api/webhooks/kiwify/${openWebhookSecret(secret.data.ciphertext)}`;
      } catch {
        result.webhookUrl = null;
      }
    }
    return result;
  }

  if (row.status === 'conectado' && admin) {
    try {
      const secret = await admin.from('connection_secrets').select('ciphertext').eq('sales_connection_id', row.id).eq('user_id', userId).maybeSingle();
      if (secret.data) {
        const creds = openKiwifySecret(secret.data.ciphertext);
        result.webhookActive = Boolean(creds.webhookId);
        const kiwify = createKiwify();
        const { accessToken } = await kiwify.token(creds.clientId, creds.clientSecret);
        const products = await kiwify.products({ token: accessToken, accountId: creds.accountId });
        result.products = products.filter((p) => p.id).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) }));
      }
    } catch {
      result.products = null;
    }
  }
  return result;
}
