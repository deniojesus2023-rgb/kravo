'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { decryptSecret, parseKey } from '@/lib/crypto/secret';
import { getMetaEnv } from '@/lib/meta/config';
import { createGraph } from '@/lib/meta/graph';
import { runMetaSync } from '@/lib/meta/run';
import { supabaseRunDb } from '@/lib/meta/sync-store';
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
