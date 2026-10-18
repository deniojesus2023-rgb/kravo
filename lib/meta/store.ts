import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret, parseKey } from '@/lib/crypto/secret';
import type { ConnectionStore } from './flow';

/** Grava a conexão do Meta com o cliente administrativo. O token entra cifrado e só em connection_secrets. */
export function supabaseConnectionStore(admin: SupabaseClient): ConnectionStore {
  return {
    async save({ userId, accessToken, expiresAt, metaUserId, metaUserName, permissions, accounts }) {
      const key = parseKey(process.env.TOKEN_ENCRYPTION_KEY);
      const ciphertext = encryptSecret(accessToken, key);

      const fields = {
        user_id: userId,
        meta_user_id: metaUserId,
        meta_user_name: metaUserName,
        status: 'conectado',
        granted_permissions: permissions,
        expires_at: expiresAt,
      };

      const existing = await admin.from('meta_connections').select('id').eq('user_id', userId).order('created_at').limit(1);
      if (existing.error) throw new Error('falha ao ler conexão');
      let connectionId = existing.data?.[0]?.id as string | undefined;
      if (connectionId) {
        const { error } = await admin.from('meta_connections').update(fields).eq('id', connectionId).eq('user_id', userId);
        if (error) throw new Error('falha ao atualizar conexão');
      } else {
        const { data, error } = await admin.from('meta_connections').insert(fields).select('id').single();
        if (error || !data) throw new Error('falha ao criar conexão');
        connectionId = data.id as string;
      }

      const del = await admin.from('connection_secrets').delete().eq('meta_connection_id', connectionId).eq('user_id', userId);
      if (del.error) throw new Error('falha ao trocar credencial');
      const ins = await admin.from('connection_secrets').insert({ user_id: userId, meta_connection_id: connectionId, ciphertext });
      if (ins.error) throw new Error('falha ao gravar credencial');

      if (accounts.length > 0) {
        // `selected` fica de fora: contas já escolhidas continuam escolhidas, as novas começam desmarcadas.
        const { error } = await admin.from('ad_accounts').upsert(
          accounts.map((a) => ({
            user_id: userId,
            meta_connection_id: connectionId,
            meta_account_id: a.id,
            name: a.name,
            currency: a.currency,
            timezone_name: a.timezoneName,
            account_status: a.accountStatus,
          })),
          { onConflict: 'user_id,meta_account_id' },
        );
        if (error) throw new Error('falha ao gravar contas de anúncios');
      }
    },
  };
}
