'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decryptSecret, parseKey } from '@/lib/crypto/secret';
import { getMetaEnv } from '@/lib/meta/config';
import { createGraph } from '@/lib/meta/graph';
import { runMetaSync } from '@/lib/meta/run';
import { supabaseRunDb } from '@/lib/meta/sync-store';
import { createKiwify, KiwifyApiError } from '@/lib/kiwify/client';
import { kiwifyDiagnosticParams } from '@/lib/kiwify/diagnostic';
import { runKiwifySync } from '@/lib/kiwify/run';
import { openKiwifySecret, sealKiwifySecret, sealWebhookSecret, supabaseKiwifyRunDb } from '@/lib/kiwify/store';
import { hashWebhookSecret, newWebhookSecret } from '@/lib/kiwify/webhook';
import { orderNotifier } from '@/lib/notifications/notifier';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/** Marca ou desmarca uma conta de anúncios para leitura. Só contas em BRL podem ser lidas. */
export async function setAdAccountSelected(id: string, selected: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!supabase || !(await supabase.auth.getUser()).data.user) return { error: 'Entre na sua conta para continuar.' };

  if (selected) {
    const { data } = await supabase.from('ad_accounts').select('currency').eq('id', id).maybeSingle();
    if (!data) return { error: 'Conta não encontrada.' };
    if (data.currency !== 'BRL') return { error: 'A trakfy calcula em BRL e ainda não lê contas em outra moeda.' };
  }
  // A RLS garante que só a conta do próprio usuário é alterada; o GRANT só permite a coluna `selected`.
  const { error } = await supabase.from('ad_accounts').update({ selected }).eq('id', id);
  if (error) return { error: 'Não foi possível salvar a escolha agora.' };
  revalidatePath('/integracoes');
  return {};
}

/** Desconecta o Meta: revoga o acesso no Facebook, apaga a credencial cifrada e desmarca as contas. */
export async function disconnectMeta(): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const admin = createAdminClient();
  if (!admin) redirect('/integracoes?meta=nao_configurado');

  const conn = await admin.from('meta_connections').select('id').eq('user_id', user.id);
  for (const { id } of conn.data ?? []) {
    const secret = await admin.from('connection_secrets').select('ciphertext').eq('meta_connection_id', id).eq('user_id', user.id).maybeSingle();
    const env = getMetaEnv();
    if (secret.data && env) {
      try {
        await createGraph(env).revoke(decryptSecret(secret.data.ciphertext, parseKey(process.env.TOKEN_ENCRYPTION_KEY)));
      } catch {
        // Sem chave ou credencial ilegível: seguimos e apagamos de qualquer jeito.
      }
    }
    await admin.from('connection_secrets').delete().eq('meta_connection_id', id).eq('user_id', user.id);
    await admin.from('ad_accounts').update({ selected: false }).eq('meta_connection_id', id).eq('user_id', user.id);
    await admin.from('meta_connections').update({ status: 'desconectado', expires_at: null }).eq('id', id).eq('user_id', user.id);
  }
  revalidatePath('/', 'layout');
  redirect('/integracoes?meta=desconectado');
}

/** Sincroniza agora as contas escolhidas. No máximo uma vez a cada 2 minutos. O resultado volta só em números e códigos fixos. */
export async function syncMetaNow(): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const env = getMetaEnv();
  const admin = createAdminClient();
  if (!env || !admin) redirect('/integracoes?meta=nao_configurado');

  let target: string;
  try {
    const outcome = await runMetaSync({ userId: user.id, graph: createGraph(env), db: supabaseRunDb(admin), minIntervalSeconds: 120 });
    target = outcome.ok
      ? `/integracoes?sync=ok&c=${outcome.campaigns}&v=${outcome.linked}&n=${outcome.unlinked}&m=${outcome.metricRows}`
      : `/integracoes?sync=erro&codigo=${outcome.code}`;
  } catch {
    target = '/integracoes?sync=erro&codigo=banco';
  }
  revalidatePath('/', 'layout');
  redirect(target);
}

const FIELD = {
  clientId: /^[A-Za-z0-9_-]{8,80}$/,
  // Só viaja no corpo de um formulário e nunca entra em texto montado: basta ser uma sequência sem espaços.
  clientSecret: /^\S{16,500}$/,
  accountId: /^[A-Za-z0-9_-]{6,40}$/,
};

async function publicOrigin(): Promise<string | null> {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : null;
}

/**
 * Conecta a Kiwify: valida as credenciais com uma chamada real, guarda-as cifradas, cria o webhook na Kiwify
 * (só um aviso; os dados vêm de GET /sales) e dispara a primeira leitura. As credenciais não passam pelo chat nem pelo log.
 */
export async function connectKiwify(data: FormData): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const admin = createAdminClient();
  if (!admin || !process.env.TOKEN_ENCRYPTION_KEY) redirect('/integracoes?kiwify=nao_configurado#kiwify');

  const clientId = String(data.get('client_id') ?? '').trim();
  const clientSecret = String(data.get('client_secret') ?? '').trim();
  const accountId = String(data.get('account_id') ?? '').trim();
  if (!FIELD.clientId.test(clientId) || !FIELD.clientSecret.test(clientSecret) || !FIELD.accountId.test(accountId)) {
    redirect('/integracoes?kiwify=campos#kiwify');
  }

  const kiwify = createKiwify();
  let accessToken = '';
  let step: 'token' | 'produtos' = 'token';
  try {
    accessToken = (await kiwify.token(clientId, clientSecret)).accessToken;
    step = 'produtos';
    await kiwify.products({ token: accessToken, accountId }); // confirma o ID da conta e a permissão de produtos
  } catch (error) {
    const status = error instanceof KiwifyApiError ? error.status : 0;
    const bad = [400, 401, 403].includes(status);
    const params = new URLSearchParams({ kiwify: bad ? (step === 'token' ? 'credencial' : 'conta') : 'erro', ...kiwifyDiagnosticParams({ step, status }) });
    redirect(`/integracoes?${params}#kiwify`);
  }

  // Uma conexão por usuário e plataforma: reconectar troca a credencial e o webhook.
  const existing = await admin.from('sales_connections').select('id').eq('user_id', user.id).eq('platform', 'Kiwify').limit(1);
  if (existing.error) redirect('/integracoes?kiwify=salvar#kiwify');
  let connectionId = existing.data?.[0]?.id as string | undefined;
  if (connectionId) {
    const old = await admin.from('connection_secrets').select('ciphertext').eq('sales_connection_id', connectionId).eq('user_id', user.id).maybeSingle();
    if (old.data) {
      try {
        const prev = openKiwifySecret(old.data.ciphertext);
        if (prev.webhookId) await kiwify.deleteWebhook({ token: accessToken, accountId }, prev.webhookId);
      } catch {
        // Webhook antigo já não existe ou a credencial antiga não abre: seguimos.
      }
    }
  }

  const webhookSecret = newWebhookSecret();
  const fields = { user_id: user.id, platform: 'Kiwify', status: 'conectado', mode: 'api', webhook_secret_hash: hashWebhookSecret(webhookSecret), last_synced_at: null };
  if (connectionId) {
    const { error } = await admin.from('sales_connections').update(fields).eq('id', connectionId).eq('user_id', user.id);
    if (error) redirect('/integracoes?kiwify=salvar#kiwify');
  } else {
    const { data: created, error } = await admin.from('sales_connections').insert(fields).select('id').single();
    if (error || !created) redirect('/integracoes?kiwify=salvar#kiwify');
    connectionId = created.id as string;
  }

  let webhookId: string | null = null;
  const origin = await publicOrigin();
  if (origin) {
    try {
      webhookId = (
        await kiwify.createWebhook(
          { token: accessToken, accountId },
          { name: 'trakfy', url: `${origin}/api/webhooks/kiwify/${webhookSecret}`, token: newWebhookSecret() },
        )
      ).id;
    } catch {
      webhookId = null;
    }
  }

  await admin.from('connection_secrets').delete().eq('sales_connection_id', connectionId).eq('user_id', user.id);
  const saved = await admin
    .from('connection_secrets')
    .insert({ user_id: user.id, sales_connection_id: connectionId, ciphertext: sealKiwifySecret({ clientId, clientSecret, accountId, webhookId }) });
  if (saved.error) redirect('/integracoes?kiwify=salvar#kiwify');

  const db = supabaseKiwifyRunDb(admin);
  after(() => runKiwifySync({ userId: user.id, kiwify, db, notify: orderNotifier(admin) }).catch(() => undefined));
  revalidatePath('/', 'layout');
  redirect(`/integracoes?kiwify=${webhookId ? 'ok' : 'ok_sem_webhook'}#kiwify`);
}

/**
 * Conecta a Kiwify só por URL: a trakfy gera o endereço (com um segredo aleatório), o usuário cola no painel da Kiwify
 * e os dados vêm no corpo dos avisos. Sem chave de API. Chamar de novo gera uma URL nova e a antiga deixa de valer.
 */
export async function connectKiwifyWebhook(): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const admin = createAdminClient();
  if (!admin || !process.env.TOKEN_ENCRYPTION_KEY) redirect('/integracoes?kiwify=nao_configurado#kiwify');

  const existing = await admin.from('sales_connections').select('id').eq('user_id', user.id).eq('platform', 'Kiwify').limit(1);
  if (existing.error) redirect('/integracoes?kiwify=salvar#kiwify');

  const secret = newWebhookSecret();
  const fields = {
    user_id: user.id,
    platform: 'Kiwify',
    status: 'conectado',
    mode: 'webhook',
    webhook_secret_hash: hashWebhookSecret(secret),
    last_synced_at: null,
    last_webhook_at: null,
    last_webhook_sample: null,
  };
  let connectionId = existing.data?.[0]?.id as string | undefined;
  if (connectionId) {
    const { error } = await admin.from('sales_connections').update(fields).eq('id', connectionId).eq('user_id', user.id);
    if (error) redirect('/integracoes?kiwify=salvar#kiwify');
  } else {
    const { data, error } = await admin.from('sales_connections').insert(fields).select('id').single();
    if (error || !data) redirect('/integracoes?kiwify=salvar#kiwify');
    connectionId = data.id as string;
  }

  await admin.from('connection_secrets').delete().eq('sales_connection_id', connectionId).eq('user_id', user.id);
  const saved = await admin.from('connection_secrets').insert({ user_id: user.id, sales_connection_id: connectionId, ciphertext: sealWebhookSecret(secret) });
  if (saved.error) redirect('/integracoes?kiwify=salvar#kiwify');

  revalidatePath('/', 'layout');
  redirect('/integracoes?kiwify=url_gerada#kiwify');
}

/** Desconecta a Kiwify: apaga o webhook (se der), a credencial cifrada e o segredo do endereço. Os pedidos já lidos ficam. */
export async function disconnectKiwify(): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const admin = createAdminClient();
  if (!admin) redirect('/integracoes?kiwify=nao_configurado#kiwify');

  const conns = await admin.from('sales_connections').select('id').eq('user_id', user.id).eq('platform', 'Kiwify');
  for (const { id } of conns.data ?? []) {
    const secret = await admin.from('connection_secrets').select('ciphertext').eq('sales_connection_id', id).eq('user_id', user.id).maybeSingle();
    if (secret.data) {
      try {
        const creds = openKiwifySecret(secret.data.ciphertext);
        if (creds.webhookId) {
          const kiwify = createKiwify();
          const { accessToken } = await kiwify.token(creds.clientId, creds.clientSecret);
          await kiwify.deleteWebhook({ token: accessToken, accountId: creds.accountId }, creds.webhookId);
        }
      } catch {
        // Sem chave, credencial recusada ou webhook já apagado: apagamos do nosso lado de qualquer jeito.
      }
    }
    await admin.from('connection_secrets').delete().eq('sales_connection_id', id).eq('user_id', user.id);
    await admin.from('sales_connections').update({ status: 'desconectado', webhook_secret_hash: null, mode: 'api' }).eq('id', id).eq('user_id', user.id);
  }
  revalidatePath('/', 'layout');
  redirect('/integracoes?kiwify=desconectado#kiwify');
}

/** Lê as vendas agora. No máximo uma vez a cada 2 minutos. O resultado volta só em números e códigos fixos. */
export async function syncKiwifyNow(): Promise<void> {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) redirect('/login?next=/integracoes');
  const admin = createAdminClient();
  if (!admin) redirect('/integracoes?kiwify=nao_configurado#kiwify');

  let target: string;
  try {
    const outcome = await runKiwifySync({ userId: user.id, kiwify: createKiwify(), db: supabaseKiwifyRunDb(admin), minIntervalSeconds: 120, notify: orderNotifier(admin) });
    target = outcome.ok
      ? `/integracoes?ksync=ok&kf=${outcome.fetched}&ks=${outcome.saved}&kn=${outcome.semOferta}#kiwify`
      : `/integracoes?ksync=erro&kcodigo=${outcome.code}#kiwify`;
  } catch {
    target = '/integracoes?ksync=erro&kcodigo=banco#kiwify';
  }
  revalidatePath('/', 'layout');
  redirect(target);
}

/** Liga (ou desliga, com texto vazio) uma oferta a um produto da Kiwify. A RLS garante que só mexe nas ofertas do próprio usuário. */
export async function linkOfferProduct(offerId: string, productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!supabase || !(await supabase.auth.getUser()).data.user) return { error: 'Entre na sua conta para continuar.' };
  if (!/^[0-9a-f-]{36}$/.test(offerId)) return { error: 'Oferta não encontrada.' };
  if (productId && !/^[A-Za-z0-9_-]{6,64}$/.test(productId)) return { error: 'Produto inválido.' };

  const { data, error } = await supabase
    .from('offers')
    .update({ sales_product_id: productId || null })
    .eq('id', offerId)
    .eq('sales_platform', 'Kiwify')
    .select('id');
  if (error) return { error: error.code === '23505' ? 'Este produto já está ligado a outra oferta.' : 'Não foi possível salvar agora.' };
  if (!data?.length) return { error: 'Oferta não encontrada ou não é da Kiwify.' };
  revalidatePath('/', 'layout');
  return {};
}
