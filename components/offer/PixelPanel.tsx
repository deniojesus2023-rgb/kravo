'use client';

import { useActionState, useTransition } from 'react';
import { removePixel, savePixel, testPixel, toggleCapi, type PixelState } from '@/app/(app)/ofertas/[id]/rastreamento/actions';

export interface PixelView {
  pixelId: string;
  testCode: string | null;
  enabled: boolean;
  status: 'novo' | 'ok' | 'token_invalido' | 'erro';
  hasToken: boolean;
  lastOkAt: string | null;
}

const STATUS: Record<PixelView['status'], string> = { novo: 'Ainda sem envio', ok: 'Funcionando', token_invalido: 'Token recusado pelo Meta', erro: 'Com erro' };
const input = 'h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[14px] text-fg num';
const button = 'inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover disabled:opacity-60';

function Message({ state }: { state: PixelState }) {
  if (!state) return null;
  return (
    <p role={state.error ? 'alert' : 'status'} className={`text-[13px] ${state.error ? 'text-negative' : 'text-positive'}`}>
      {state.error ?? state.ok}
    </p>
  );
}

export function PixelPanel({ offerId, pixel }: { offerId: string; pixel: PixelView | null }) {
  const [saved, save, saving] = useActionState(savePixel.bind(null, offerId), undefined);
  const [toggled, toggle, toggling] = useActionState(toggleCapi.bind(null, offerId), undefined);
  const [extra, run] = useTransition();
  const [result, setResult] = useActionState<PixelState, 'teste' | 'remover'>(async (_, what) => (what === 'teste' ? testPixel(offerId) : removePixel(offerId)), undefined);

  return (
    <section aria-labelledby="capi-titulo" className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 id="capi-titulo" className="text-[16px] font-semibold">API de Conversões (pixel desta oferta)</h2>
        <p className="text-[13px] text-fg-muted">
          Envia ao Meta cada venda aprovada da plataforma de vendas, com dados do comprador em hash (SHA-256). O CPF nunca é enviado. Serve para o Meta otimizar pelo que
          realmente vendeu.
        </p>
        {pixel && (
          <p className="text-[13px]">
            Situação: <strong>{STATUS[pixel.status]}</strong> · Envio {pixel.enabled ? 'ligado' : 'desligado'}
            {pixel.lastOkAt ? ` · último envio ok em ${new Date(pixel.lastOkAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
          </p>
        )}
      </div>

      <form action={save} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pixelId" className="text-[13px] text-fg-muted">ID do pixel</label>
          <input id="pixelId" name="pixelId" inputMode="numeric" defaultValue={pixel?.pixelId ?? ''} className={input} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="testCode" className="text-[13px] text-fg-muted">Código de “Eventos de teste” (opcional)</label>
          <input id="testCode" name="testCode" defaultValue={pixel?.testCode ?? ''} className={input} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="token" className="text-[13px] text-fg-muted">Token de acesso da API de Conversões {pixel?.hasToken ? '(já guardado; cole outro só para trocar)' : ''}</label>
          <input id="token" name="token" type="password" autoComplete="off" className={input} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={saving} className={button}>{saving ? 'Salvando…' : 'Salvar pixel'}</button>
          <Message state={saved} />
        </div>
      </form>

      {pixel && (
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={extra} className={button} onClick={() => run(() => setResult('teste'))}>Enviar evento de teste</button>
            <button type="button" disabled={extra} className={button} onClick={() => run(() => setResult('remover'))}>Remover pixel</button>
            <Message state={result} />
          </div>
          <form action={toggle} className="flex flex-col gap-3">
            <input type="hidden" name="enable" value={pixel.enabled ? '0' : '1'} />
            {!pixel.enabled && (
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" name="confirm" className="mt-0.5" />
                <span>
                  Confirmo que o evento Purchase do pixel do checkout (Kiwify) está desligado, ou usa o mesmo ID do pedido. Sem isso, o Meta conta a venda duas vezes.
                </span>
              </label>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={toggling} className={button}>{pixel.enabled ? 'Desligar envio' : 'Ligar envio'}</button>
              <Message state={toggled} />
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
