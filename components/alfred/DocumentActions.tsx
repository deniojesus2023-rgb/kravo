'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDocumentAction, reprocessDocumentAction } from '@/app/alfred/biblioteca/actions';
import type { AlfredDocument } from '@/lib/alfred/types';
import { runProcessing } from './processing';
import { ConfirmDialog } from './states';

const btn = 'inline-flex h-9 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50';

/** Ações de administrador sobre um documento: continuar a leitura, ler de novo e excluir. */
export function DocumentActions({ doc }: { doc: Pick<AlfredDocument, 'id' | 'name' | 'status'> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function resume() {
    setBusy(true);
    setMessage('Lendo…');
    const r = await runProcessing(doc.id, (p) => (setMessage(`Lendo: ${p.processed} de ${p.pages} páginas`), router.refresh()));
    setMessage(r.ok ? null : r.message);
    setBusy(false);
    router.refresh();
  }
  async function reprocess() {
    setBusy(true);
    const r = await reprocessDocumentAction(doc.id);
    router.refresh();
    if (!r.ok) {
      setMessage('Não foi possível reiniciar a leitura.');
      setBusy(false);
      return;
    }
    await resume();
  }
  async function remove() {
    setBusy(true);
    const r = await deleteDocumentAction(doc.id);
    setConfirming(false);
    setBusy(false);
    if (r.ok) router.refresh();
    else setMessage('Não foi possível excluir agora.');
  }

  const resumable = doc.status === 'aguardando' || doc.status === 'processando';
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {resumable && <button type="button" onClick={resume} disabled={busy} className={btn}>Continuar leitura</button>}
        {!resumable && <button type="button" onClick={reprocess} disabled={busy} className={btn}>Ler de novo</button>}
        <button type="button" onClick={() => setConfirming(true)} disabled={busy} className={`${btn} hover:text-loss`}>Excluir</button>
      </div>
      {message && <p role="status" className="m-0 max-w-[36ch] text-right text-[12px] text-fg-muted">{message}</p>}
      <ConfirmDialog open={confirming} title="Excluir documento?" description={`“${doc.name}” e tudo o que o Alfred aprendeu dele serão apagados para todos. Isso não pode ser desfeito.`} confirmLabel="Excluir" pending={busy} onCancel={() => setConfirming(false)} onConfirm={remove} />
    </div>
  );
}
