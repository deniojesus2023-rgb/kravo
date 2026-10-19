'use client';

import { useEffect, useState, useTransition } from 'react';
import { removeDevice, saveDevice, sendTestNotification } from '@/app/(app)/configuracoes/actions';

type State = 'carregando' | 'sem_chave' | 'ios_instalar' | 'nao_suportado' | 'negado' | 'inativo' | 'ativo';

const btn = 'inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60';

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

const b64url = (buffer: ArrayBuffer | null) =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';

async function toServer(sub: PushSubscription) {
  return saveDevice({
    endpoint: sub.endpoint,
    p256dh: b64url(sub.getKey('p256dh')),
    auth: b64url(sub.getKey('auth')),
    userAgent: navigator.userAgent,
  });
}

/** Ativa ou desativa as notificações NESTE aparelho. A permissão só pode ser pedida num toque do usuário. */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>('carregando');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    async function detect() {
      if (!publicKey) return setState('sem_chave');
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return setState(ios && !standalone ? 'ios_instalar' : 'nao_suportado');
      }
      if (Notification.permission === 'denied') return setState('negado');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') {
        setState('ativo');
        void toServer(sub); // mantém o servidor em dia se o aparelho trocou de chave ou de conta
      } else {
        setState('inativo');
      }
    }
    void detect().catch(() => setState('nao_suportado'));
  }, [publicKey]);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return setState(permission === 'denied' ? 'negado' : 'inativo');
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) }));
        const result = await toServer(sub);
        if (result.error) return setMessage(result.error);
        setState('ativo');
      } catch {
        setMessage('Não foi possível ativar as notificações neste aparelho.');
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await removeDevice(sub.endpoint);
          await sub.unsubscribe();
        }
        setState('inativo');
      } catch {
        setMessage('Não foi possível desativar agora.');
      }
    });
  }

  function test() {
    setMessage(null);
    start(async () => {
      const r = await sendTestNotification();
      setMessage(r.delivered ? 'Teste enviado. A notificação deve chegar em instantes.' : (r.error ?? 'Não foi possível enviar.'));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {state === 'carregando' && <p className="m-0 text-[13px] text-fg-muted">Verificando este aparelho…</p>}
      {state === 'sem_chave' && <p className="m-0 text-[13px] text-warn">As notificações ainda não estão configuradas neste ambiente (faltam as chaves do servidor).</p>}
      {state === 'nao_suportado' && <p className="m-0 text-[13px] text-warn">Este navegador não suporta notificações. Tente o Chrome ou o Safari atualizados.</p>}
      {state === 'negado' && (
        <p className="m-0 text-[13px] text-warn">
          As notificações estão bloqueadas para a trakfy neste aparelho. Libere em Ajustes do aparelho ou do navegador e volte aqui.
        </p>
      )}
      {state === 'ios_instalar' && (
        <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-fg-muted">
          <p className="m-0 font-medium text-fg">No iPhone, instale a trakfy primeiro:</p>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
            <li>Abra este endereço no Safari (não em outro navegador).</li>
            <li>Toque em Compartilhar e depois em Adicionar à Tela de Início.</li>
            <li>Abra a trakfy pelo ícone novo e volte a Configurações.</li>
          </ol>
          <p className="m-0 text-xs text-fg-subtle">Exige iOS 16.4 ou mais novo.</p>
        </div>
      )}
      {(state === 'inativo' || state === 'ativo') && (
        <div className="flex flex-wrap items-center gap-2">
          {state === 'inativo' ? (
            <button type="button" onClick={enable} disabled={pending} className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover disabled:opacity-60">
              Ativar neste aparelho
            </button>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium">
                <span aria-hidden="true" className="size-[7px] rounded-full bg-profit" />
                Ativas neste aparelho
              </span>
              <button type="button" onClick={test} disabled={pending} className={btn}>
                Enviar teste
              </button>
              <button type="button" onClick={disable} disabled={pending} className="h-9 rounded-lg px-3 text-[13.5px] text-fg-muted underline underline-offset-2 hover:text-fg">
                Desativar
              </button>
            </>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="m-0 text-[13px] text-fg-muted">
          {message}
        </p>
      )}
    </div>
  );
}
