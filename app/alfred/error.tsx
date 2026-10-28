'use client';

import { ErrorState } from '@/components/alfred/states';

export default function AlfredError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <ErrorState description="Algo falhou ao abrir esta tela. Tente de novo; se continuar, volte ao início do Alfred." onRetry={reset} />
    </div>
  );
}
