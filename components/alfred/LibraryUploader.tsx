'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createUploadAction } from '@/app/(app)/alfred/biblioteca/actions';
import { INGEST_ERROR_TEXT } from '@/lib/alfred/errors';
import { DocumentUpload } from './DocumentUpload';
import { runProcessing } from './processing';

interface Item {
  key: string;
  name: string;
  state: 'enviando' | 'lendo' | 'concluido' | 'erro';
  text: string;
}

const BUCKET = 'alfred-documents';
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Envio de PDFs (administradores). O arquivo vai direto ao armazenamento privado com um link assinado de uso único
 * (não passa pelo servidor do app, que tem limite de tamanho) e depois é lido em partes, com o progresso real.
 */
export function LibraryUploader({ supabaseUrl, supabaseKey }: { supabaseUrl: string; supabaseKey: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const busy = useRef(false);

  const patch = (key: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function handle(files: File[]) {
    if (busy.current) return;
    busy.current = true;
    const storage = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage;
    for (const file of files) {
      const key = `${Date.now()}-${file.name}-${file.size}`;
      setItems((l) => [...l, { key, name: file.name, state: 'enviando', text: 'Enviando o arquivo…' }]);
      if (file.size > MAX_BYTES) {
        patch(key, { state: 'erro', text: INGEST_ERROR_TEXT.arquivo_invalido });
        continue;
      }
      const created = await createUploadAction(file.name, file.size).catch(() => null);
      if (!created || !created.ok) {
        patch(key, { state: 'erro', text: INGEST_ERROR_TEXT[created && !created.ok ? created.error : 'envio_falhou'] });
        continue;
      }
      const up = await storage.from(BUCKET).uploadToSignedUrl(created.path, created.token, file, { contentType: 'application/pdf' });
      router.refresh();
      if (up.error) {
        patch(key, { state: 'erro', text: `${INGEST_ERROR_TEXT.envio_falhou} O documento aparece na lista como "Aguardando": use Excluir e envie de novo.` });
        continue;
      }
      patch(key, { state: 'lendo', text: 'Arquivo enviado. Lendo o PDF…' });
      const result = await runProcessing(created.docId, (p) => {
        patch(key, { text: `Lendo: ${p.processed} de ${p.pages} páginas` });
        router.refresh();
      });
      router.refresh();
      patch(key, result.ok ? { state: 'concluido', text: result.status === 'parcial' ? 'Leitura concluída com páginas que falharam (veja o documento).' : result.status === 'erro' ? INGEST_ERROR_TEXT.sem_texto : 'Leitura concluída. O Alfred já consulta este documento.' } : { state: 'erro', text: result.message });
    }
    busy.current = false;
  }

  return (
    <div className="flex flex-col gap-4">
      <DocumentUpload enabled onFiles={handle} limitsText="Somente PDF, até 50 MB por arquivo e 2.000 páginas. Mantenha esta aba aberta enquanto o Alfred lê." />
      {items.length > 0 && (
        <ul aria-label="Envios desta sessão" className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((i) => (
            <li key={i.key} className="flex flex-col gap-0.5 rounded-lg border border-line px-3.5 py-2.5 text-[13px]">
              <span className="truncate font-medium" title={i.name}>{i.name}</span>
              <span role={i.state === 'erro' ? 'alert' : 'status'} className={i.state === 'erro' ? 'text-loss' : i.state === 'concluido' ? 'text-profit' : 'text-fg-muted'}>{i.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
