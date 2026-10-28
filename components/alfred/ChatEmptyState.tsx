import { BarChart3, FileSearch, Filter, PenLine, type LucideIcon } from 'lucide-react';
import { SUGGESTIONS } from '@/lib/alfred/nav';
import { AlfredMark } from './AlfredMark';

const ICONS: LucideIcon[] = [FileSearch, PenLine, BarChart3, Filter];

/** Estado inicial do chat. Clicar numa sugestão preenche o campo; o usuário edita e envia. */
export function ChatEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-8 px-4 py-10 text-center sm:py-16">
      <div className="flex flex-col items-center gap-5">
        <AlfredMark size={52} />
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[12px] font-medium tracking-[0.22em] text-brand uppercase">ALFRED</p>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] sm:text-[34px]">Qual decisão precisamos tomar?</h1>
        </div>
        <p className="m-0 max-w-[56ch] text-[14.5px] leading-relaxed text-fg-muted">Analise ofertas, criativos, campanhas e funis utilizando inteligência estratégica e conhecimento especializado.</p>
      </div>
      <ul className="m-0 grid w-full list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = ICONS[i]!;
          return (
            <li key={s.title}>
              <button type="button" onClick={() => onPick(s.prompt)} className="flex h-full min-h-[88px] w-full items-start gap-3.5 rounded-xl border border-line bg-surface p-4 text-left hover:border-line-strong hover:bg-surface-hover">
                <Icon size={19} aria-hidden="true" className="mt-0.5 flex-none text-brand" />
                <span className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-medium">{s.title}</span>
                  <span className="text-[13px] leading-snug text-fg-muted">{s.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
