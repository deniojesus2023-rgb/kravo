import 'server-only';
import webpush from 'web-push';
import type { Device, PushResult } from './dispatch';
import type { Message } from './format';

/** Chaves VAPID: a pública também vai ao navegador (NEXT_PUBLIC_VAPID_PUBLIC_KEY); a privada só existe no servidor. */
export function getVapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || process.env.APP_URL?.trim() || 'mailto:contato@trakfy.invalid';
  return { publicKey, privateKey, subject };
}

/** Envia um push. 404 e 410 = o aparelho revogou ou desinstalou. A mensagem de erro do serviço nunca sai daqui. */
export async function sendPush(device: Device, message: Message): Promise<PushResult> {
  const vapid = getVapid();
  if (!vapid) return 'erro';
  try {
    await webpush.sendNotification(
      { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify({ title: message.title, body: message.body, url: message.url }),
      { vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 3600, timeout: 10_000 },
    );
    return 'ok';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? 'gone' : 'erro';
  }
}
