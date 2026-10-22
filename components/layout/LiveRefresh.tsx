'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Mantém os números vivos enquanto o app está aberto: depois que o servidor dispara uma leitura do Meta em segundo
 * plano, a tela se atualiza sozinha em seguida, e de 2 em 2 minutos (só com a aba visível e ao voltar para ela).
 */
export function LiveRefresh({ enabled, justTriggered }: { enabled: boolean; justTriggered: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || !justTriggered) return;
    const t = setTimeout(() => router.refresh(), 12_000);
    return () => clearTimeout(t);
  }, [enabled, justTriggered, router]);

  useEffect(() => {
    if (!enabled) return;
    let hiddenAt: number | null = null;
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 120_000);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt !== null && Date.now() - hiddenAt > 60_000) router.refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, router]);

  return null;
}
