import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';

const footerLink = 'underline underline-offset-2 hover:text-fg-muted';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-7 px-4 py-10">
      <div className="flex w-[560px] max-w-[calc(100vw-2rem)] flex-col items-center gap-[18px]">
        <Logo large />
        <p className="m-0 text-center text-[22px] leading-tight text-balance font-semibold tracking-[-0.025em] sm:text-[26px]">
          Pare de adivinhar. Comece a decidir.
        </p>
      </div>
      <div className="w-full rounded-2xl border border-line bg-surface p-6 sm:p-8">{children}</div>
      <p className="m-0 flex w-full items-start gap-2.5 text-[13px] leading-normal text-fg-muted">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-0.5 flex-none"
        >
          <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
        </svg>
        <span>A trakfy só lê métricas e envia eventos. Ela não cria, edita nem pausa anúncios.</span>
      </p>
      <p className="m-0 flex gap-4 text-xs text-fg-subtle">
        <Link href="/privacidade" className={footerLink}>
          Privacidade
        </Link>
        <Link href="/termos" className={footerLink}>
          Termos
        </Link>
        <Link href="/exclusao-de-dados" className={footerLink}>
          Exclusão de dados
        </Link>
      </p>
    </main>
  );
}
