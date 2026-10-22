import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OfferHeader } from '@/components/offer/OfferHeader';
import { PixelPanel, type PixelView } from '@/components/offer/PixelPanel';
import { UnderConstruction } from '@/components/ui/PageStates';
import { getContext, getOffer } from '@/lib/data';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const offer = await getOffer((await params).id);
  return { title: offer ? `Rastreamento · ${offer.name}` : 'Oferta não encontrada' };
}

const STATUS_EVENT: Record<string, string> = { pendente: 'Pendente', enviado: 'Enviado', erro: 'Erro', descartado: 'Descartado' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await getOffer(id);
  if (!offer) notFound();
  const context = await getContext();

  let pixel: PixelView | null = null;
  let events: { id: string; event_id: string; status: string; attempts: number; last_error: string | null; event_time: string; test: boolean }[] = [];
  if (!context.isSample) {
    const supabase = await createClient();
    const admin = createAdminClient();
    const row = supabase ? (await supabase.from('offer_pixels').select('pixel_id, test_event_code, capi_enabled, status, last_ok_at').eq('offer_id', id).maybeSingle()).data : null;
    if (row && admin) {
      const { data: user } = await supabase!.auth.getUser();
      const secret = user.user ? (await admin.from('connection_secrets').select('id').eq('offer_id', id).eq('user_id', user.user.id).maybeSingle()).data : null;
      pixel = { pixelId: row.pixel_id, testCode: row.test_event_code, enabled: row.capi_enabled, status: row.status, hasToken: Boolean(secret), lastOkAt: row.last_ok_at };
    }
    if (supabase && row) {
      events = (await supabase.from('capi_events').select('id, event_id, status, attempts, last_error, event_time, test').eq('offer_id', id).order('created_at', { ascending: false }).limit(20)).data ?? [];
    }
  }

  return (
    <>
      <OfferHeader offer={offer} current="/rastreamento" isSample={context.isSample} />
      {context.isSample ? (
        <UnderConstruction title="Rastreamento" />
      ) : (
        <div className="flex flex-col gap-6">
          <PixelPanel offerId={id} pixel={pixel} />
          {events.length > 0 && (
            <section aria-labelledby="envios-titulo" className="flex flex-col gap-3">
              <h2 id="envios-titulo" className="text-[16px] font-semibold">Últimos envios ao Meta</h2>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-[13px]">
                  <thead className="text-fg-muted">
                    <tr><th className="px-3 py-2 font-medium">Pedido</th><th className="px-3 py-2 font-medium">Venda em</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 font-medium">Tentativas</th><th className="px-3 py-2 font-medium">Motivo</th></tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-line">
                        <td className="num px-3 py-2">{e.event_id.slice(0, 12)}</td>
                        <td className="num px-3 py-2">{new Date(e.event_time).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                        <td className="px-3 py-2">{STATUS_EVENT[e.status] ?? e.status}{e.test ? ' (teste)' : ''}</td>
                        <td className="num px-3 py-2">{e.attempts}</td>
                        <td className="px-3 py-2">{e.last_error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
