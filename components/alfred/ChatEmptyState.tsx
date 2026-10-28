import { BarChart3, FileSearch, Filter, PenLine, type LucideIcon } from 'lucide-react';
import { SUGGESTIONS } from '@/lib/alfred/nav';
import { AlfredMark } from './AlfredMark';

const ICONS: LucideIcon[] = [FileSearch, PenLine, BarChart3, Filter];

/** Estado inicial do chat. Clicar numa sugestão preenche o campo; o usuário edita e envia. */
export function ChatEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-9 px-4 py-10 sm:py-16">
      <div className="flex flex-col gap-4">
        <AlfredMark size={36} />
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em] sm:text-[30px]">Qual decisão precisamos tomar?</h1>
        <p className="m-0 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-muted">Analise ofertas, criativos, campanhas e funis utilizando inteligência estratégica e conhecimento especializado.</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-x-6 p-0 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = ICONS[i]!;
          return (
            <li key={s.title} className="border-t border-line-faint">
              <button type="button" onClick={() => onPick(s.prompt)} className="flex w-full items-start gap-3 rounded-lg px-1 py-4 text-left hover:bg-surface/60">
                <Icon size={17} aria-hidden="true" className="mt-0.5 flex-none text-fg-subtle" />
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
