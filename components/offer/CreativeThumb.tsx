'use client';

import { useState } from 'react';

/** Miniatura do criativo. O link do Meta expira: se falhar, mostra um ícone neutro em vez de imagem quebrada. */
export function CreativeThumb({ url, isVideo, label, rank }: { url: string | null; isVideo: boolean; label: string; rank: number }) {
  const [failed, setFailed] = useState(false);
  const show = url && !failed;
  return (
    <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md bg-surface-hover text-fg-subtle">
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário da CDN do Meta
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          {isVideo ? (
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M10 8.5v7l6-3.5z" />
            </>
          ) : (
            <>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M4 18l5-5 4 4 3-3 4 4" />
            </>
          )}
        </svg>
      )}
      {label && <span className="absolute bottom-1.5 left-2 rounded bg-canvas/70 px-1.5 text-[11px] text-fg-muted">{label}</span>}
      <span className="num absolute right-2 top-1.5 rounded bg-canvas/70 px-1.5 text-[11px] text-fg-muted">#{rank}</span>
    </div>
  );
}
