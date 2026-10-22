'use client';

import Link from 'next/link';
import { useActionState, useId, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { FromCampaignsState } from '@/app/(app)/ofertas/nova/actions';
import { formatBRL } from '@/lib/format';

export interface PickableCampaign {
  id: string;
  name: string;
  active: boolean;
  dailyBudgetCents: number | null;
  accountName: string | null;
}

export interface KiwifyChoice {
  connected: boolean;
  /** `null` = não foi possível listar agora. */
  products: Array<{ id: string; name: string }> | null;
}

const input = 'h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[14px] text-fg placeholder:text-fg-subtle';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[13.5px] font-semibold text-canvas hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Ativando… pode levar alguns segundos' : 'Ativar oferta'}
    </button>
  );
}

/** Nova oferta: escolhe as campanhas do Meta, o nome e o gateway. Nada depende do nome das campanhas. */
export function NewOfferFromCampaigns({
  action,
  campaigns,
  kiwify,
}: {
  action: (state: FromCampaignsState, data: FormData) => Promise<FromCampaignsState>;
  campaigns: PickableCampaign[];
  kiwify: KiwifyChoice;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const id = useId();
  const err = state?.errors ?? {};

  const [selected, setSelected] = useState<Set<string>>(() => new Set(state?.values?.campaignIds ?? []));
  const [onlyActive, setOnlyActive] = useState(true);
  const [query, setQuery] = useState('');
  const [name, setName] = useState(state?.values?.name ?? '');
  const [nameEdited, setNameEdited] = useState(Boolean(state?.values?.name));
  const [platform, setPlatform] = useState(state?.values?.salesPlatform || 'Kiwify');
  const [product, setProduct] = useState(state?.values?.productId ?? '');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(campaigns.filter((c) => (!onlyActive || c.active || selected.has(c.id)) && (!q || c.name.toLowerCase().includes(q))).map((c) => c.id));
  }, [campaigns, onlyActive, query, selected]);

  function toggle(campaignId: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(campaignId);
    else next.delete(campaignId);
    setSelected(next);
    // O nome sugerido segue a primeira campanha escolhida, até o usuário digitar o dele.
    if (!nameEdited) setName(campaigns.find((c) => next.has(c.id))?.name.slice(0, 80) ?? '');
  }

  const section = 'card flex flex-col gap-3.5 p-5';
  const label = 'text-[13px] text-fg-muted';

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state?.error && (
        <p role="alert" className="m-0 rounded-lg border border-loss/40 px-3.5 py-2.5 text-[13.5px] text-loss">
          {state.error}
        </p>
      )}

      <section className={section} aria-labelledby={`${id}-camp`}>
        <h2 id={`${id}-camp`} className="m-0 text-base font-semibold">
          1. Campanhas do Meta
        </h2>
        <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
          São as campanhas que a trakfy leu da sua conta de anúncios. Escolha as que fazem parte desta oferta. O rastreamento começa quando você ativa.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5">
            <label htmlFor={`${id}-q`} className={label}>
              Buscar campanha
            </label>
            <input id={`${id}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={input} />
          </div>
          <label className="flex items-center gap-2 pt-5 text-[13px]">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="size-4 accent-brand" />
            Só campanhas ativas
          </label>
        </div>

        <ul className="m-0 flex max-h-[360px] list-none flex-col gap-2 overflow-y-auto p-0" aria-label="Campanhas disponíveis">
          {campaigns.map((c) => (
            <li key={c.id} hidden={!visible.has(c.id)}>
              <label className="flex items-start gap-3 rounded-lg border border-line px-3.5 py-2.5">
                <input type="checkbox" name="campaign" value={c.id} checked={selected.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} className="mt-1 size-4 accent-brand" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13.5px] font-medium break-words">{c.name}</span>
                  <span className="num text-xs text-fg-subtle">
                    {c.active ? 'Ativa' : 'Pausada'}
                    {c.dailyBudgetCents !== null ? ` · ${formatBRL(c.dailyBudgetCents)}/dia` : ''}
                    {c.accountName ? ` · ${c.accountName}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="m-0 text-xs text-fg-subtle" aria-live="polite">
          {selected.size} {selected.size === 1 ? 'campanha escolhida' : 'campanhas escolhidas'}.
          {visible.size === 0 && ' Nenhuma campanha com este filtro.'}
        </p>
        {err.campaigns && (
          <p role="alert" className="m-0 text-[13px] text-loss">
            {err.campaigns}
          </p>
        )}
      </section>

      <section className={section} aria-labelledby={`${id}-oferta`}>
        <h2 id={`${id}-oferta`} className="m-0 text-base font-semibold">
          2. Oferta
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-name`} className={label}>
            Nome da oferta
          </label>
          <input
            id={`${id}-name`}
            name="name"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
            aria-invalid={err.name ? true : undefined}
            className={input}
          />
          {err.name && (
            <span role="alert" className="text-xs text-loss">
              {err.name}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-price`} className={label}>
            Preço (opcional)
          </label>
          <input id={`${id}-price`} name="price" inputMode="decimal" placeholder="29,90" defaultValue={state?.values?.price ?? ''} className={input} />
          <span className="text-xs text-fg-subtle">Sem preço, o ticket médio vem das vendas.</span>
          {err.price && (
            <span role="alert" className="text-xs text-loss">
              {err.price}
            </span>
          )}
        </div>
      </section>

      <section className={section} aria-labelledby={`${id}-gw`}>
        <h2 id={`${id}-gw`} className="m-0 text-base font-semibold">
          3. Gateway de vendas
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-platform`} className={label}>
            Plataforma
          </label>
          <select id={`${id}-platform`} name="salesPlatform" value={platform} onChange={(e) => setPlatform(e.target.value)} className={input}>
            <option value="Kiwify">Kiwify</option>
            <option value="Hotmart" disabled>
              Hotmart (em breve)
            </option>
            <option value="Eduzz" disabled>
              Eduzz (em breve)
            </option>
            <option value="Shopify" disabled>
              Shopify (em breve)
            </option>
          </select>
          {err.salesPlatform && (
            <span role="alert" className="text-xs text-loss">
              {err.salesPlatform}
            </span>
          )}
        </div>

        {platform === 'Kiwify' &&
          (kiwify.connected ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-product`} className={label}>
                Produto da Kiwify
              </label>
              <select id={`${id}-product`} name="productId" value={product} onChange={(e) => setProduct(e.target.value)} className={input}>
                <option value="">Ligar depois</option>
                {(kiwify.products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-relaxed text-fg-subtle">
                {kiwify.products && kiwify.products.length > 0
                  ? 'Sem o produto ligado, os pedidos não entram nesta oferta e lucro e ROAS real ficam desconhecidos.'
                  : 'Nenhum produto da Kiwify visto ainda. Depois do primeiro aviso de venda ou Pix ele aparece aqui, ou ligue depois em Integrações.'}
              </span>
              {err.product && (
                <span role="alert" className="text-xs text-loss">
                  {err.product}
                </span>
              )}
            </div>
          ) : (
            <p className="m-0 rounded-lg border border-line px-3.5 py-3 text-[13px] leading-relaxed text-fg-muted">
              A Kiwify ainda não está conectada. É uma conexão só, que vale para todas as ofertas.{' '}
              <Link href="/integracoes#kiwify" className="text-fg underline underline-offset-2">
                Conectar a Kiwify
              </Link>
              . Você pode ativar a oferta agora e ligar o produto depois.
            </p>
          ))}
      </section>

      <div>
        <Submit />
      </div>
    </form>
  );
}
