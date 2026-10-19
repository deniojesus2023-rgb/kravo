import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyOrderEvents } from './dispatch';
import type { OrderEvent } from './events';
import { supabaseNotifyDeps } from './store';

/** Ligação de produção: avisos de pedidos → fila + push. Passado como `notify` para `runKiwifySync`. */
export const orderNotifier = (admin: SupabaseClient) => (userId: string, events: OrderEvent[]) => notifyOrderEvents(userId, events, supabaseNotifyDeps(admin));
