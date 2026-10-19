import type { Metadata } from 'next';
import { AdAccountList } from '@/components/integrations/AdAccountList';
import { SampleDataTag } from '@/components/ui/SampleDataTag';
import { formatDateShort, formatUpdatedAt } from '@/lib/format';
import { getContext, getMetaConnection } from '@/lib/data';
import { describeDiagnostic } from '@/lib/meta/diagnostic';
import { readMetaIntegration, type MetaIntegration } from '@/lib/meta/read';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/cn';
import { disconnectMeta, syncMetaNow } from './actions';

export const metadata: Metadata = { title: 'Integrações' };

const MESSAGES: Record<string, { tone: 'ok' | 'erro'; text: string }> = {
  ok: { tone: 'ok', text: 'Meta Ads conectado. Escolha abaixo as contas de anúncios que a trakfy pode ler.' },
  desconectado: { tone: 'ok', text: 'Meta Ads desconectado. O acesso foi removido e a credencial foi apagada.' },
  negado: { tone: 'erro', text: 'Você cancelou a autorização no Facebook. Nada foi conectado.' },
  estado_invalido: { tone: 'erro', text: 'A autorização expirou ou não pôde ser confirmada. Tente conectar de novo.' },
  permissao: { tone: 'erro', text: 'A permissão de leitura de anúncios (ads_read) não foi concedida. Sem ela a trakfy não consegue ler suas métricas.' },
  meta: { tone: 'erro', text: 'A Meta recusou a conexão ou não respondeu. Tente de novo em instantes.' },
  salvar: { tone: 'erro', text: 'Você autorizou, mas não foi possível salvar a conexão. Tente de novo.' },
  nao_configurado: { tone: 'erro', text: 'A conexão com o Meta ainda não está configurada neste ambiente (faltam as chaves do app).' },
};

const SYNC_ERRORS: Record<string, string> = {
  sem_conexao: 'Conecte o Meta Ads antes de sincronizar.',
  sem_contas: 'Escolha ao menos uma conta de anúncios para sincronizar.',
  expirada: 'O acesso ao Meta expirou. Reconecte para voltar a sincronizar.',
  muito_recente: 'A última sincronização foi há menos de 2 minutos. Aguarde um pouco.',
  token_invalido: 'A Meta não aceitou mais o acesso. Reconecte o Meta Ads.',
  limite_da_meta: 'A Meta limitou as consultas por agora. Tente de novo em alguns minutos.',
  meta_erro: 'A Meta recusou ou não respondeu à leitura das métricas. Tente de novo em instantes.',
  banco: 'Não foi possível gravar as métricas agora. Tente de novo.',
  moeda_nao_suportada: 'A trakfy lê só contas em BRL.',
};
const count = (v: string | undefined) => (v && /^\d{1,6}$/.test(v) ? Number(v) : null);

const STATUS: Record<MetaIntegration['status'], { label: string; dot: string }> = {
  conectado: { label: 'Conectado', dot: 'bg-profit' },
  expirando: { label: 'Acesso expirando', dot: 'bg-warn' },
  desconectado: { label: 'Desconectado', dot: 'bg-loss' },
  nao_conectado: { label: 'Não conectado', dot: 'border border-fg-subtle' },
};

const PLATFORMS = [
  { name: 'Kiwify', desc: 'Pedidos aprovados, reembolsos e chargebacks chegam à trakfy e entram no cálculo do lucro.' },
  { name: 'Hotmart', desc: 'Lê pedidos aprovados, reembolsos e chargebacks para cruzar com o gasto em mídia de cada oferta.' },
  { name: 'Eduzz', desc: 'Conecte para cruzar as vendas da Eduzz com o gasto em mídia de cada oferta.' },
  { name: 'Shopify', desc: 'Para ofertas vendidas em loja própria. Lê pedidos, reembolsos e UTMs do checkout.' },
];

const btn = 'inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover';
const row = 'flex justify-between gap-4 border-t border-line py-2.5 text-[13px]';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ meta?: string; etapa?: string; codigo?: string; sub?: string; http?: string; salvar?: string; sync?: string; c?: string; v?: string; n?: string; m?: string }>;
}) {
  const query = await searchParams;
  const message = MESSAGES[query.meta ?? ''];
  const campaigns = count(query.c);
  const linked = count(query.v);
  const unlinked = count(query.n);
  const syncMessage =
    query.sync === 'ok' && campaigns !== null && linked !== null && unlinked !== null
      ? {
          tone: 'ok' as const,
          text: `Sincronizado: ${campaigns} ${campaigns === 1 ? 'campanha' : 'campanhas'}, ${linked} ligadas a ofertas.${
            unlinked > 0 ? ` ${unlinked} sem oferta: o nome da campanha precisa começar com o código da oferta, como CODIGO_estrutura.` : ''
          }`,
        }
      : query.sync === 'erro'
        ? { tone: 'erro' as const, text: SYNC_ERRORS[query.codigo ?? ''] ?? SYNC_ERRORS.meta_erro }
        : null;
  const detail = message?.tone === 'erro' ? describeDiagnostic(query) : null;
  const [context, connection, supabase] = await Promise.all([getContext(), getMetaConnection(), createClient()]);
  const meta = supabase ? await readMetaIntegration(supabase) : null;
  const status = STATUS[meta?.status ?? 'nao_conectado'];
  const connected = meta && (meta.status === 'conectado' || meta.status === 'expirando');

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Integrações</h1>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
          <span>Conecte suas contas para a trakfy ler gasto, eventos e vendas.</span>
          {context.isSample && <SampleDataTag />}
        </span>
      </div>

      {message && (
        <p
          role={message.tone === 'erro' ? 'alert' : 'status'}
          className={cn(
            'm-0 rounded-lg border px-3.5 py-2.5 text-[13.5px]',
            message.tone === 'erro' ? 'border-loss/40 text-loss' : 'border-line-strong text-fg',
          )}
        >
          {message.text}
          {detail && <span className="mt-1 block text-xs text-fg-muted">Detalhe técnico: {detail}.</span>}
        </p>
      )}

      {syncMessage && (
        <p
          role={syncMessage.tone === 'erro' ? 'alert' : 'status'}
          className={cn(
            'm-0 rounded-lg border px-3.5 py-2.5 text-[13.5px]',
            syncMessage.tone === 'erro' ? 'border-loss/40 text-loss' : 'border-line-strong text-fg',
          )}
        >
          {syncMessage.text}
        </p>
      )}

      <section className="card flex flex-wrap gap-7 p-[22px]" aria-labelledby="meta">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="meta" className="m-0 text-lg font-semibold">
                Meta Ads
              </h2>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                <span aria-hidden="true" className={cn('size-[7px] rounded-full', status.dot)} />
                {status.label}
              </span>
            </div>
            <span className="text-[13px] leading-relaxed text-fg-muted">
              Entrada pelo login oficial da Meta. A trakfy não vê sua senha e você pode revogar o acesso a qualquer momento nas
              configurações do Facebook.
            </span>
          </div>

          {!meta ? (
            <p className="m-0 text-[13px] text-fg-muted">A conexão precisa da autenticação configurada neste ambiente.</p>
          ) : connected ? (
            <>
              <dl className="m-0 flex flex-col">
                <div className={row}>
                  <dt className="text-fg-muted">Conta conectada</dt>
                  <dd className="m-0">{meta.userName ?? 'Conta do Facebook'}</dd>
                </div>
                <div className={row}>
                  <dt className="text-fg-muted">Última sincronização</dt>
                  <dd className="num m-0">
                    {connection.lastSync ? formatUpdatedAt(connection.lastSync.finishedAt, context.now) : 'nenhuma ainda'}
                  </dd>
                </div>
                <div className={row}>
                  <dt className="text-fg-muted">Acesso expira em</dt>
                  <dd className={cn('num m-0', meta.status === 'expirando' && 'text-warn')}>
                    {meta.expiresAt && meta.daysLeft !== null
                      ? `${formatDateShort(meta.expiresAt)} · ${meta.daysLeft} ${meta.daysLeft === 1 ? 'dia' : 'dias'}`
                      : 'sem data informada'}
                  </dd>
                </div>
              </dl>
              {meta.status === 'expirando' && (
                <p className="m-0 text-[13px] text-warn">Reconecte antes que o acesso expire, para a leitura não parar.</p>
              )}
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-fg-muted">Permissões concedidas</span>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {meta.permissions.map((p) => (
                    <li key={p} className="num rounded-md border border-line-strong px-2 py-0.5 text-xs">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              {connection.lastSync && !connection.lastSync.ok && (
                <p className="m-0 text-[13px] text-warn">A última sincronização falhou. Tente sincronizar de novo.</p>
              )}
              <p className="m-0 text-xs leading-relaxed text-fg-subtle">
                Lê gasto, impressões, cliques e compras reportadas pelo Meta, por campanha e por dia, com janela de atribuição
                de 7 dias de clique. Uma campanha só entra numa oferta se o nome começar com o código dela (por exemplo
                VASOS_CBO_ESCALA). Sincroniza sozinha uma vez por dia.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={syncMetaNow}>
                  <button
                    type="submit"
                    disabled={meta.accounts.every((a) => !a.selected)}
                    className={cn(btn, 'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent')}
                  >
                    Sincronizar agora
                  </button>
                </form>
                <a href="/api/meta/connect" className={btn}>
                  Reconectar
                </a>
                <form action={disconnectMeta}>
                  <button type="submit" className="h-9 rounded-lg px-3 text-[13.5px] text-fg-muted underline underline-offset-2 hover:text-fg">
                    Desconectar
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
                {meta.status === 'desconectado'
                  ? 'O acesso foi removido ou expirou. Conecte de novo para retomar a leitura.'
                  : 'Conecte sua conta do Facebook para a trakfy ler as métricas das suas campanhas.'}
              </p>
              <div>
                <a
                  href="/api/meta/connect"
                  className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover"
                >
                  Conectar com Facebook
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
          <h3 className="m-0 text-[15px] font-semibold">Contas de anúncios</h3>
          {connected ? (
            <AdAccountList accounts={meta.accounts} />
          ) : (
            <p className="m-0 text-[13px] text-fg-muted">As contas aparecem aqui depois que você conectar o Meta Ads.</p>
          )}
          <span className="text-xs leading-relaxed text-fg-subtle">
            A trakfy lê métricas e envia eventos de conversão. Ela não cria, edita nem pausa anúncios.
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-3.5">
        <h2 className="m-0 text-base font-semibold">Plataformas de venda</h2>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 p-0">
          {PLATFORMS.map((p) => (
            <li key={p.name} className="card flex flex-col gap-3 px-5 py-[18px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold">{p.name}</span>
                <span className="inline-flex items-center gap-2 text-[12.5px] font-medium">
                  <span aria-hidden="true" className="size-[7px] rounded-full border border-fg-subtle" />
                  Não conectado
                </span>
              </div>
              <span className="min-h-10 text-[13px] leading-snug text-fg-muted">{p.desc}</span>
              <span className="text-xs text-fg-subtle">Nenhum pedido sincronizado</span>
              <div>
                <button type="button" disabled className={cn(btn, 'cursor-not-allowed opacity-60 hover:bg-transparent')}>
                  Em breve
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="m-0 text-xs leading-relaxed text-fg-subtle">
        Cada plataforma tem autenticação, limites de uso e formato de dados próprios. Uma integração só aparece como conectada
        depois de autorizada e testada com uma chamada real.
      </p>
    </>
  );
}
