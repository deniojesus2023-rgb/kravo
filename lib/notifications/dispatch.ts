/** Grava os avisos (uma vez cada) e envia o push aos aparelhos do usuário. Banco e push entram por parâmetro (testável). */

import type { OrderEvent } from './events';
import { formatOrderEvent, PREFERENCE_FOR_KIND, type Message, type Preferences } from './format';

export type NotificationKind = OrderEvent['kind'] | 'resumo' | 'teste';

export interface Device {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone` = o aparelho desinstalou ou revogou: a inscrição é apagada. `erro` = falha passageira. */
export type PushResult = 'ok' | 'gone' | 'erro';

export interface NotifyDeps {
  preferences(userId: string): Promise<Preferences>;
  devices(userId: string): Promise<Device[]>;
  offerNames(userId: string, offerIds: string[]): Promise<Map<string, string>>;
  /** Insere só os avisos novos (chave de deduplicação inédita) e devolve os ids inseridos. */
  insertNew(userId: string, items: Array<Message & { kind: NotificationKind; dedupeKey: string }>): Promise<Array<{ id: string; dedupeKey: string }>>;
  markSent(id: string, sent: boolean, errorCode: string | null): Promise<void>;
  removeDevice(deviceId: string): Promise<void>;
  push(device: Device, message: Message): Promise<PushResult>;
}

export interface DispatchResult {
  created: number;
  delivered: number;
}

async function deliver(userId: string, items: Array<Message & { kind: NotificationKind; dedupeKey: string }>, deps: NotifyDeps): Promise<DispatchResult> {
  if (items.length === 0) return { created: 0, delivered: 0 };
  const devices = await deps.devices(userId);
  // Sem aparelho não há para quem avisar. Nada é gravado: quem ativar depois não recebe um histórico antigo de uma vez.
  if (devices.length === 0) return { created: 0, delivered: 0 };

  const inserted = await deps.insertNew(userId, items);
  const byKey = new Map(items.map((i) => [i.dedupeKey, i]));
  let delivered = 0;
  for (const row of inserted) {
    const item = byKey.get(row.dedupeKey)!;
    const results = await Promise.all(devices.map((d) => deps.push(d, item).catch((): PushResult => 'erro')));
    await Promise.all(devices.filter((_, i) => results[i] === 'gone').map((d) => deps.removeDevice(d.id).catch(() => undefined)));
    const ok = results.some((r) => r === 'ok');
    if (ok) delivered += 1;
    await deps.markSent(row.id, ok, ok ? null : results.every((r) => r === 'gone') ? 'sem_aparelho' : 'push_erro').catch(() => undefined);
  }
  return { created: inserted.length, delivered };
}

/** Avisos de pedidos (venda, Pix, boleto, reembolso, chargeback), respeitando o que o usuário ligou. */
export async function notifyOrderEvents(userId: string, events: OrderEvent[], deps: NotifyDeps): Promise<DispatchResult> {
  if (events.length === 0) return { created: 0, delivered: 0 };
  const prefs = await deps.preferences(userId);
  const wanted = events.filter((e) => prefs[PREFERENCE_FOR_KIND[e.kind]]);
  if (wanted.length === 0) return { created: 0, delivered: 0 };
  const names = await deps.offerNames(userId, [...new Set(wanted.flatMap((e) => (e.offerId ? [e.offerId] : [])))]);
  return deliver(
    userId,
    wanted.map((e) => ({ kind: e.kind, dedupeKey: e.dedupeKey, ...formatOrderEvent(e, (e.offerId ? names.get(e.offerId) : null) ?? e.label ?? 'Venda', prefs.hide_amounts) })),
    deps,
  );
}

/** Aviso já formatado (resumo do dia, teste). */
export async function notifyMessage(userId: string, kind: NotificationKind, dedupeKey: string, message: Message, deps: NotifyDeps): Promise<DispatchResult> {
  return deliver(userId, [{ kind, dedupeKey, ...message }], deps);
}
