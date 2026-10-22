import 'server-only';
import { headers } from 'next/headers';

/** Endereço público do app. APP_URL, quando definido, vale mais que o cabeçalho Host (que o cliente controla). */
export async function publicOrigin(): Promise<string | null> {
  const fixed = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return host ? `${h.get('x-forwarded-proto') ?? 'https'}://${host}` : null;
}
