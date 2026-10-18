'use client';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card flex flex-col items-start gap-3 p-6" role="alert">
      <h1 className="m-0 text-base font-semibold">Não foi possível carregar os dados</h1>
      <p className="m-0 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-muted">
        Houve uma falha ao ler os dados. Nada foi alterado e nenhum valor foi estimado. Tente de novo.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-9 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium hover:bg-surface-hover"
      >
        Tentar de novo
      </button>
    </section>
  );
}
