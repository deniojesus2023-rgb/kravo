import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCapi } from '@/lib/capi/graph';
import { eventsToEnqueue, processQueue } from '@/lib/capi/queue';
import { supabaseCapiStore } from '@/lib/capi/store';
import { notifyOrderEvents } from './dispatch';
import type { OrderEvent } from './events';
import { supabaseNotifyDeps } from './store';

/** Vendas aprovadas entram na fila da API de Conversões (só ofertas com envio ligado) e já tentam seguir. */
async function sendToMeta(admin: SupabaseClient, userId: string, events: OrderEvent[]) {
  const offerIds = [...new Set(events.filter((e) => e.kind === 'venda_aprovada' && e.offerId).map((e) => e.offerId as string))];
  if (offerIds.length === 0) return;
  const store = supabaseCapiStore(admin);
  const now = new Date();
  const configs = await store.pixelConfigs(userId, offerIds);
  await store.insertEvents(eventsToEnqueue({ userId, events, configs, now }));
  const capi = createCapi();
  await processQueue({ store, send: (i) => capi.sendEvents(i), now, userId });
}

/** Ligação de produção: avisos de pedidos → push e API de Conversões, independentes entre si. */
export const orderNotifier = (admin: SupabaseClient) => async (userId: string, events: OrderEvent[]) => {
  const [notified, capi] = await Promise.allSettled([notifyOrderEvents(userId, events, supabaseNotifyDeps(admin)), sendToMeta(admin, userId, events)]);
  if (notified.status === 'rejected') throw notified.reason;
  // Falha no envio ao Meta não derruba o aviso; a fila tenta de novo pelo agendador.
  void capi;
  return notified.value;
};
