import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-4 px-4">
      <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Página não encontrada</h1>
      <Link href="/" className="inline-flex h-9 w-fit items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover">
        Voltar para a Visão geral
      </Link>
    </main>
  );
}
