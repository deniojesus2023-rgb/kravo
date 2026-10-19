import type { Metadata } from 'next';
import { PushSettings } from '@/components/settings/PushSettings';
import { cn } from '@/lib/cn';
import { DEFAULT_PREFERENCES, type Preferences } from '@/lib/notifications/format';
import { createClient } from '@/lib/supabase/server';
import { savePreferences } from './actions';

export const metadata: Metadata = { title: 'Configurações' };

const GROUPS: Array<{ title: string; items: Array<{ key: keyof Preferences; label: string; hint?: string }> }> = [
  {
    title: 'Avisos de pedidos',
    items: [
      { key: 'sale_approved', label: 'Venda aprovada' },
      { key: 'pix_generated', label: 'Pix gerado' },
      { key: 'boleto_generated', label: 'Boleto gerado' },
      { key: 'refunded', label: 'Reembolso' },
      { key: 'chargeback', label: 'Chargeback' },
    ],
  },
  {
    title: 'Resumos do dia',
    items: [
      { key: 'summary_morning', label: 'Manhã, às 08h', hint: 'Fechamento de ontem.' },
      { key: 'summary_afternoon', label: 'Tarde, às 14h', hint: 'Hoje até agora.' },
      { key: 'summary_evening', label: 'Noite, às 20h', hint: 'Fechamento de hoje.' },
    ],
  },
  {
    title: 'Privacidade',
    items: [{ key: 'hide_amounts', label: 'Esconder valores em dinheiro nas notificações', hint: 'O texto aparece na tela bloqueada do aparelho.' }],
  },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ salvo?: string; erro?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  let prefs: Preferences = DEFAULT_PREFERENCES;
  if (supabase && user) {
    const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', user.id).maybeSingle();
    if (data) prefs = { ...DEFAULT_PREFERENCES, ...Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).filter((k) => typeof data[k] === 'boolean').map((k) => [k, data[k]])) };
  }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  const serverKey = Boolean(process.env.VAPID_PRIVATE_KEY?.trim());

  let devices = 0;
  let recent: Array<{ created_at: string; title: string; body: string; sent_at: string | null; error: string | null }> = [];
  if (supabase && user) {
    const [d, n] = await Promise.all([
      supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }),
      supabase.from('notifications').select('created_at, title, body, sent_at, error').order('created_at', { ascending: false }).limit(5),
    ]);
    devices = d.count ?? 0;
    recent = n.data ?? [];
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Configurações</h1>
        <span className="text-[13px] text-fg-muted">Notificações de venda e resumos do dia, no celular.</span>
      </div>

      {!user ? (
        <p className="m-0 text-[13.5px] text-fg-muted">As notificações precisam da autenticação configurada neste ambiente.</p>
      ) : (
        <section className="card flex flex-wrap gap-8 p-[22px]" aria-labelledby="notificacoes">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <h2 id="notificacoes" className="m-0 text-lg font-semibold">
              Notificações neste aparelho
            </h2>
            <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
              Cada aparelho precisa ser ativado uma vez. As escolhas ao lado valem para todos os seus aparelhos.
            </p>
            <PushSettings publicKey={publicKey} />
          </div>

          <form action={savePreferences} className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
            {query.salvo && (
              <p role="status" className="m-0 rounded-lg border border-line-strong px-3 py-2 text-[13px]">
                Preferências salvas.
              </p>
            )}
            {query.erro && (
              <p role="alert" className="m-0 rounded-lg border border-loss/40 px-3 py-2 text-[13px] text-loss">
                Não foi possível salvar agora. Tente de novo.
              </p>
            )}
            {GROUPS.map((group) => (
              <fieldset key={group.title} className="m-0 flex flex-col gap-2.5 border-0 p-0">
                <legend className="mb-1 p-0 text-[14px] font-semibold">{group.title}</legend>
                {group.items.map((item) => (
                  <label key={item.key} className={cn('flex items-start gap-3 rounded-lg border border-line px-3.5 py-2.5')}>
                    <input type="checkbox" name={item.key} defaultChecked={prefs[item.key]} className="mt-0.5 size-4 accent-brand" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13.5px]">{item.label}</span>
                      {item.hint && <span className="text-xs text-fg-subtle">{item.hint}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
            <div>
              <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
                Salvar preferências
              </button>
            </div>
          </form>
        </section>
      )}

      {user && (
        <section className="card flex flex-col gap-3 p-[22px]" aria-labelledby="situacao">
          <h2 id="situacao" className="m-0 text-lg font-semibold">
            Situação das notificações
          </h2>
          <dl className="m-0 flex flex-col text-[13px]">
            <div className="flex justify-between gap-4 border-t border-line py-2.5">
              <dt className="text-fg-muted">Chaves de notificação no servidor</dt>
              <dd className={cn('m-0', !(publicKey && serverKey) && 'text-warn')}>{publicKey && serverKey ? 'configuradas' : 'faltam (VAPID na Vercel)'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line py-2.5">
              <dt className="text-fg-muted">Aparelhos ativos</dt>
              <dd className={cn('num m-0', devices === 0 && 'text-warn')}>{devices === 0 ? 'nenhum: ative neste aparelho' : devices}</dd>
            </div>
          </dl>
          <h3 className="m-0 mt-1 text-[14px] font-semibold">Últimos avisos</h3>
          {recent.length === 0 ? (
            <p className="m-0 text-[13px] text-fg-muted">Nenhum aviso gerado ainda. Eles só são gerados quando há um aparelho ativo.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {recent.map((r) => (
                <li key={r.created_at + r.title} className="flex flex-col gap-0.5 rounded-lg border border-line px-3.5 py-2.5 text-[13px]">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-fg-muted">{r.body}</span>
                  <span className={cn('text-xs', r.sent_at ? 'text-fg-subtle' : 'text-warn')}>
                    {new Date(r.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} ·{' '}
                    {r.sent_at ? 'enviada ao aparelho' : r.error === 'sem_aparelho' ? 'o aparelho foi removido' : 'o envio falhou'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
