import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, saoPauloDate } from '@/lib/data/dates';
import type { PeriodRange } from '@/lib/data/types';
import { classifyCreatives, cpaCents, hookRate, linkCtr, roas, type CreativeTag } from '@/lib/rules';

export interface CreativeRow {
  id: string;
  name: string;
  status: 'ativa' | 'pausada';
  spendCents: number;
  impressions: number;
  linkClicks: number;
  views3s: number;
  /** Pedidos aprovados atribuídos a este anúncio pela UTM. `null` sem plataforma de vendas conectada. */
  sales: number | null;
  revenueCents: number | null;
  roas: number | null;
  cpaCents: number | null;
  ctr: number | null;
  hook: number | null;
  tag: CreativeTag | null;
}

export interface CreativesData {
  rows: CreativeRow[];
  /** Vendas aprovadas da oferta no período que não puderam ser ligadas a um anúncio (UTM ausente ou desconhecida). */
  unattributedSales: number;
}

const PAGE = 1000;
async function all<T>(page: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler ${what}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Anúncios de uma oferta no período: métricas do Meta por anúncio + pedidos aprovados ligados a ele. A RLS limita ao usuário. */
export async function loadCreatives(supabase: SupabaseClient, offerId: string, range: PeriodRange, salesConnected: boolean): Promise<CreativesData> {
  const metrics = await all<{ entity_id: string; spend_cents: number; impressions: number; link_clicks: number; video_views_3s: number }>(
    (a, b) => supabase.from('daily_metrics').select('entity_id, spend_cents, impressions, link_clicks, video_views_3s').eq('offer_id', offerId).eq('level', 'ad').gte('date', range.start).lte('date', range.end).order('date').order('entity_id').range(a, b),
    'métricas por anúncio',
  );
  const byAd = new Map<string, { spend: number; imp: number; clicks: number; v3: number }>();
  for (const m of metrics) {
    const t = byAd.get(m.entity_id) ?? { spend: 0, imp: 0, clicks: 0, v3: 0 };
    t.spend += Number(m.spend_cents);
    t.imp += Number(m.impressions);
    t.clicks += Number(m.link_clicks);
    t.v3 += Number(m.video_views_3s);
    byAd.set(m.entity_id, t);
  }

  const sales = new Map<string, { n: number; revenue: number }>();
  let unattributedSales = 0;
  if (salesConnected) {
    // Instante UTC que cobre o intervalo inteiro em America/Sao_Paulo; o dia exato é conferido abaixo.
    const orders = await all<{ ad_id: string | null; amount_cents: number; approved_at: string }>(
      (a, b) => supabase.from('orders').select('ad_id, amount_cents, approved_at').eq('offer_id', offerId).not('approved_at', 'is', null).gte('approved_at', `${addDays(range.start, -1)}T00:00:00Z`).lte('approved_at', `${addDays(range.end, 1)}T23:59:59Z`).order('approved_at').order('id').range(a, b),
      'pedidos',
    );
    for (const o of orders) {
      const day = saoPauloDate(o.approved_at);
      if (day < range.start || day > range.end) continue;
      if (!o.ad_id) {
        unattributedSales += 1;
        continue;
      }
      const t = sales.get(o.ad_id) ?? { n: 0, revenue: 0 };
      t.n += 1;
      t.revenue += Number(o.amount_cents);
      sales.set(o.ad_id, t);
    }
  }

  const ids = [...new Set([...byAd.keys(), ...sales.keys()])];
  const names = new Map<string, { name: string; status: 'ativa' | 'pausada' }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('ads').select('id, name, status').in('id', ids.slice(i, i + 100));
    if (error) throw new Error(`Falha ao ler anúncios: ${error.message}`);
    for (const a of data ?? []) names.set(a.id, { name: a.name, status: a.status });
  }

  const rows = ids
    .map((id): CreativeRow => {
      const m = byAd.get(id) ?? { spend: 0, imp: 0, clicks: 0, v3: 0 };
      const s = salesConnected ? (sales.get(id) ?? { n: 0, revenue: 0 }) : null;
      return {
        id,
        name: names.get(id)?.name ?? 'Anúncio sem nome',
        status: names.get(id)?.status ?? 'pausada',
        spendCents: m.spend,
        impressions: m.imp,
        linkClicks: m.clicks,
        views3s: m.v3,
        sales: s ? s.n : null,
        revenueCents: s ? s.revenue : null,
        roas: s ? roas(s.revenue, m.spend) : null,
        cpaCents: s ? cpaCents(m.spend, s.n) : null,
        ctr: linkCtr(m.clicks, m.imp),
        // Sem visualizações de 3 s o anúncio não é vídeo: não há hook rate.
        hook: m.v3 > 0 ? hookRate(m.v3, m.imp) : null,
        tag: null,
      };
    })
    .filter((r) => r.spendCents > 0 || (r.sales ?? 0) > 0);

  const tags = classifyCreatives(rows.map((r) => ({ id: r.id, spendCents: r.spendCents, sales: r.sales ?? 0, roas: r.roas })));
  for (const r of rows) r.tag = salesConnected ? (tags.get(r.id) ?? null) : null;
  // Maior ROAS primeiro; sem ROAS real, por gasto.
  rows.sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1) || b.spendCents - a.spendCents);
  return { rows, unattributedSales };
}
