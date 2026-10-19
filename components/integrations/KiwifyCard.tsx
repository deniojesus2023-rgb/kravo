import { cn } from '@/lib/cn';
import { formatUpdatedAt } from '@/lib/format';
import type { KiwifyIntegration } from '@/lib/kiwify/read';
import { connectKiwify, disconnectKiwify, syncKiwifyNow } from '@/app/(app)/integracoes/actions';
import { ConnectKiwifyButton } from './ConnectKiwifyButton';
import { OfferProductLinks } from './OfferProductLinks';

export interface KiwifyNotice {
  tone: 'ok' | 'erro';
  text: string;
  detail: string | null;
}

const btn = 'inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover';
const input = 'h-10 rounded-lg border border-line-strong bg-canvas px-3 text-[14px] text-fg placeholder:text-fg-subtle';

const STATUS = {
  conectado: { label: 'Conectado', dot: 'bg-profit' },
  erro: { label: 'Credencial recusada', dot: 'bg-loss' },
  desconectado: { label: 'Desconectado', dot: 'bg-loss' },
  nao_conectado: { label: 'Não conectado', dot: 'border border-fg-subtle' },
} as const;

/** Card da Kiwify em Integrações: credenciais (cifradas no servidor), produtos × ofertas e leitura de vendas. */
export function KiwifyCard({ data, now, notices }: { data: KiwifyIntegration; now: string; notices: KiwifyNotice[] }) {
  const status = STATUS[data.status];
  const connected = data.status === 'conectado';
  const unlinked = data.offers.filter((o) => !o.productId).length;

  return (
    <li id="kiwify" className="card flex scroll-mt-20 flex-col gap-4 px-5 py-[18px]" style={{ gridColumn: '1 / -1' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold">Kiwify</h3>
        <span className="inline-flex items-center gap-2 text-[12.5px] font-medium">
          <span aria-hidden="true" className={cn('size-[7px] rounded-full', status.dot)} />
          {status.label}
        </span>
      </div>

      {notices.map((n) => (
        <p
          key={n.text}
          role={n.tone === 'erro' ? 'alert' : 'status'}
          className={cn('m-0 rounded-lg border px-3.5 py-2.5 text-[13.5px]', n.tone === 'erro' ? 'border-loss/40 text-loss' : 'border-line-strong text-fg')}
        >
          {n.text}
          {n.detail && <span className="mt-1 block text-xs text-fg-muted">Detalhe técnico: {n.detail}.</span>}
        </p>
      ))}

      {connected ? (
        <>
          <dl className="m-0 flex flex-col">
            <div className="flex justify-between gap-4 border-t border-line py-2.5 text-[13px]">
              <dt className="text-fg-muted">Última leitura de vendas</dt>
              <dd className="num m-0">{data.lastSync ? formatUpdatedAt(data.lastSync.finishedAt, now) : 'nenhuma ainda'}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line py-2.5 text-[13px]">
              <dt className="text-fg-muted">Aviso em tempo real (webhook)</dt>
              <dd className={cn('m-0', !data.webhookActive && 'text-warn')}>{data.webhookActive ? 'ativo' : 'não criado: a leitura roda uma vez por dia'}</dd>
            </div>
          </dl>
          {data.lastSync && !data.lastSync.ok && <p className="m-0 text-[13px] text-warn">A última leitura falhou. Tente de novo.</p>}

          <div className="flex flex-col gap-2.5">
            <h4 className="m-0 text-[14px] font-semibold">Produto de cada oferta</h4>
            <p className="m-0 text-xs leading-relaxed text-fg-subtle">
              Os pedidos só entram numa oferta com o produto ligado. Sem isso, lucro e ROAS real dela continuam como desconhecidos.
              {unlinked > 0 && ` ${unlinked} ${unlinked === 1 ? 'oferta está' : 'ofertas estão'} sem produto.`}
            </p>
            {data.offers.length === 0 ? (
              <p className="m-0 text-[13px] text-fg-muted">Cadastre uma oferta da Kiwify para ligar um produto.</p>
            ) : data.products ? (
              <OfferProductLinks offers={data.offers} products={data.products} />
            ) : (
              <p className="m-0 text-[13px] text-warn">Não foi possível listar os produtos da Kiwify agora. Tente recarregar a página.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form action={syncKiwifyNow}>
              <button type="submit" className={btn}>
                Ler vendas agora
              </button>
            </form>
            <form action={disconnectKiwify}>
              <button type="submit" className="h-9 rounded-lg px-3 text-[13.5px] text-fg-muted underline underline-offset-2 hover:text-fg">
                Desconectar
              </button>
            </form>
          </div>
        </>
      ) : (
        <form action={connectKiwify} className="flex max-w-[520px] flex-col gap-3.5" autoComplete="off">
          <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
            {data.status === 'erro'
              ? 'A Kiwify recusou a credencial. Crie uma nova em Apps, API, e cole de novo.'
              : 'Na Kiwify, abra Apps, API, Criar API Key. Copie o client_id, o client_secret e o ID da conta. Eles ficam cifrados no servidor e nunca voltam para a tela.'}
          </p>
          {(['client_id', 'client_secret', 'account_id'] as const).map((name) => {
            const label = { client_id: 'client_id', client_secret: 'client_secret', account_id: 'ID da conta' }[name];
            return (
              <div key={name} className="flex flex-col gap-1.5">
                <label htmlFor={`kiwify-${name}`} className="text-[13px] text-fg-muted">
                  {label}
                </label>
                <input
                  id={`kiwify-${name}`}
                  name={name}
                  type={name === 'client_secret' ? 'password' : 'text'}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className={input}
                />
              </div>
            );
          })}
          <p className="m-0 text-xs leading-relaxed text-fg-subtle">
            A trakfy só lê vendas e cria um webhook de aviso na sua conta da Kiwify. Ela não altera produtos, preços nem reembolsa vendas.
          </p>
          <div>
            <ConnectKiwifyButton />
          </div>
        </form>
      )}
    </li>
  );
}
