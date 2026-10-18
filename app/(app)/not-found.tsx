import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Página não encontrada</h1>
      <p className="m-0 max-w-[60ch] text-[13.5px] text-fg-muted">
        Esta oferta ou página não existe. Escolha uma oferta no menu ou volte para a Visão geral.
      </p>
      <Link href="/" className="inline-flex h-9 w-fit items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
        Voltar para a Visão geral
      </Link>
    </>
  );
}
