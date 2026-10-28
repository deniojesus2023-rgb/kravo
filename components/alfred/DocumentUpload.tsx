'use client';

import { useState } from 'react';
import { UploadCloud } from 'lucide-react';

/**
 * Área de envio de PDFs (arrastar e soltar ou escolher arquivos). Sem backend de documentos ela fica desativada
 * e diz isso: nenhum arquivo é lido, enviado nem listado como "enviado".
 */
export function DocumentUpload({ enabled = false, limitsText, disabledText, onFiles }: { enabled?: boolean; limitsText?: string; disabledText?: string; onFiles?: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const active = enabled && Boolean(onFiles);

  function pick(list: FileList | null) {
    if (!active || !list) return;
    const pdfs = [...list].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length > 0) onFiles?.(pdfs);
  }

  return (
    <div
      onDragOver={(e) => active && (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!active) return;
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center ${over ? 'border-brand bg-surface' : 'border-line-strong'}`}
    >
      <UploadCloud size={26} aria-hidden="true" className="text-fg-subtle" />
      <p className="m-0 text-[14.5px] font-medium">Arraste seus PDFs ou selecione arquivos do dispositivo.</p>
      <label className={`inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-[13.5px] font-medium ${active ? 'cursor-pointer hover:bg-surface-hover focus-within:outline-2 focus-within:outline-brand' : 'cursor-not-allowed opacity-60'}`}>
        Selecionar arquivos
        <input type="file" accept="application/pdf,.pdf" multiple disabled={!active} onChange={(e) => (pick(e.target.files), (e.target.value = ''))} className="sr-only" />
      </label>
      <p className="m-0 max-w-[56ch] text-[12.5px] leading-relaxed text-fg-subtle">
        {active ? (limitsText ?? '') : (disabledText ?? 'O envio está desativado: o processamento de documentos ainda não está conectado.')}
      </p>
    </div>
  );
}
