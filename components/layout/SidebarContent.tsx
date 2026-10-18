'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ActionDot } from '@/components/ui/ActionBadge';
import { Logo } from '@/components/ui/Logo';
import { SampleDataTag } from '@/components/ui/SampleDataTag';
import { formatRoas } from '@/lib/format';
import { ACTION_LABELS, type OfferAction } from '@/lib/rules';
import { cn } from '@/lib/cn';
import { signOut } from '@/app/(auth)/actions';
import type { ConnectionStatus } from '@/lib/data';

export interface SidebarData {
  offers: Array<{ id: string; name: string; roas: number | null; action: OfferAction }>;
  meta: { status: ConnectionStatus; delayMinutes: number | null };
  isSample: boolean;
  /** Usuário logado. `null` quando a autenticação não está configurada. */
  user: { email: string } | null;
}

const META_LABEL: Record<ConnectionStatus, string> = {
  nao_conectado: 'Meta Ads não conectado',
  conectado: 'Meta Ads conectado',
  expirando: 'Meta Ads: reconectar em breve',
  desconectado: 'Meta Ads desconectado',
};
const META_DOT: Record<ConnectionStatus, string> = {
  nao_conectado: 'bg-state-neutral',
  conectado: 'bg-profit',
  expirando: 'bg-warn',
  desconectado: 'bg-loss',
};

const NAV = [
  {
    href: '/',
    label: 'Visão geral',
    icon: <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  },
  {
    href: '/integracoes',
    label: 'Integrações',
    icon: <path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8zM12 16v5" />,
  },
  {
    href: '/configuracoes',
    label: 'Configurações',
    icon: (
      <>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
  },
];

const itemClass = (active: boolean) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
    active ? 'bg-nav-active text-fg' : 'text-fg-muted hover:bg-nav-hover hover:text-fg',
  );

export function SidebarContent({ offers, meta, isSample, user }: SidebarData) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col gap-[22px]">
      <Link href="/" aria-label="kavro, Visão geral" className="px-2.5">
        <Logo />
      </Link>

      <nav aria-label="Principal" className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Ofertas" className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-2.5">
          <span className="text-xs text-fg-subtle">Ofertas · {offers.length}</span>
          <Link
            href="/ofertas/nova"
            aria-label="Nova oferta"
            className="grid size-6 place-items-center rounded-md border border-line text-base leading-none text-fg-muted hover:text-fg"
          >
            +
          </Link>
        </div>
        {offers.length === 0 && <p className="m-0 px-2.5 text-[13px] text-fg-subtle">Nenhuma oferta ainda.</p>}
        <ul className="m-0 flex list-none flex-col gap-px p-0">
          {offers.map((offer) => {
            const href = `/ofertas/${offer.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={offer.id}>
                <Link href={href} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                  <ActionDot action={offer.action} />
                  <span className="min-w-0 flex-1 truncate">{offer.name}</span>
                  <span className="sr-only">, {ACTION_LABELS[offer.action]}, ROAS real</span>
                  <span className="num text-xs text-fg-subtle">{formatRoas(offer.roas)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-1 rounded-lg border border-line-faint p-3">
        <div className="flex items-center gap-2 text-[13px]">
          <span aria-hidden="true" className={cn('size-[7px] flex-none rounded-full', META_DOT[meta.status])} />
          <span>{META_LABEL[meta.status]}</span>
        </div>
        <span className="text-xs text-fg-subtle">
          {meta.delayMinutes === null ? 'Nenhuma sincronização ainda' : `Sincronizado há ${meta.delayMinutes} min`}
        </span>
        {isSample && (
          <span className="mt-1">
            <SampleDataTag />
          </span>
        )}
      </div>

      {user && (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="min-w-0 truncate text-xs text-fg-muted" title={user.email}>
            {user.email}
          </span>
          <form action={signOut}>
            <button type="submit" className="h-7 rounded-md border border-line px-2.5 text-xs text-fg-muted hover:text-fg">
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
