import Link from 'next/link';
import type { ReactNode } from 'react';
import { embeddingUnavailableText, unavailableText, type chatStatus, type EmbeddingStatus } from '@/lib/alfred/config';

const SECTIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'preferencias', label: 'Preferências' },
  { id: 'modelos', label: 'Modelos de IA' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'memoria', label: 'Memória' },
  { id: 'privacidade', label: 'Privacidade e segurança' },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex scroll-mt-6 flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 id={`${id}-t`} className="m-0 text-[16px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Configurações. Controles sem comportamento real ficam desabilitados e explicados; só o que existe de fato
 * (a conta, o status dos recursos e os links de privacidade) é funcional.
 */
export function SettingsPanel({ email, chat, library }: { email: string | null; chat: ReturnType<typeof chatStatus>; library: { embedding: EmbeddingStatus; isAdmin: boolean } }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav aria-label="Seções das configurações" className="flex gap-1 overflow-x-auto lg:sticky lg:top-6 lg:w-[220px] lg:flex-none lg:flex-col">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex h-10 flex-none items-center rounded-lg px-3 text-[13.5px] whitespace-nowrap text-fg-muted hover:bg-nav-hover hover:text-fg">{s.label}</a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Section id="perfil" title="Perfil">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
            <dt className="text-fg-subtle">E-mail da conta</dt>
            <dd className="m-0 min-w-0 truncate">{email ?? 'Sem sessão iniciada'}</dd>
          </dl>
          <p className="m-0 text-[12.5px] text-fg-subtle">A conta é a mesma da trakfy. O e-mail é alterado pelo acesso da conta, não por aqui.</p>
        </Section>

        <Section id="preferencias" title="Preferências do Alfred">
          <ul className="m-0 flex list-none flex-col p-0">
            {['Nível de detalhamento das respostas', 'Idioma', 'Estilo de apresentação', 'Citar referências documentais nas respostas'].map((label) => (
              <li key={label} className="flex items-center justify-between gap-4 border-t border-line-faint py-3 text-[14px] first:border-t-0 first:pt-0">
                <span>{label}</span>
                <span className="text-[12.5px] text-fg-subtle">Em breve</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[12.5px] text-fg-subtle">Estas opções só aparecem como controles quando tiverem efeito real. Hoje o Alfred responde em português do Brasil, com o prompt padrão.</p>
        </Section>

        <Section id="modelos" title="Modelos de IA">
          {chat.available ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
              <dt className="text-fg-subtle">Provedor</dt>
              <dd className="m-0">OpenAI</dd>
              <dt className="text-fg-subtle">Modelo</dt>
              <dd className="num m-0">{chat.model}</dd>
              <dt className="text-fg-subtle">Limite diário</dt>
              <dd className="num m-0">{chat.dailyLimit} mensagens por pessoa</dd>
            </dl>
          ) : (
            <p className="m-0 text-[14px] text-fg-muted">{unavailableText(chat)}</p>
          )}
          <p className="m-0 text-[12.5px] text-fg-subtle">O modelo e o limite são definidos no ambiente do servidor (ALFRED_MODEL e ALFRED_DAILY_LIMIT); a escolha por conta ainda não existe.</p>
        </Section>

        <Section id="biblioteca" title="Biblioteca">
          {library.embedding.available ? (
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
              <dt className="text-fg-subtle">Modelo de embedding</dt>
              <dd className="num m-0">{library.embedding.model}</dd>
              <dt className="text-fg-subtle">Seu acesso</dt>
              <dd className="m-0">{library.isAdmin ? 'Administrador: pode enviar e excluir documentos' : 'Consulta: usa a memória do Alfred, sem enviar documentos'}</dd>
            </dl>
          ) : (
            <p className="m-0 text-[14px] text-fg-muted">{embeddingUnavailableText(library.embedding)}</p>
          )}
          <Link href="/alfred/biblioteca" className="w-fit text-[13.5px] text-fg underline underline-offset-2 hover:text-fg-muted">Abrir a Biblioteca</Link>
        </Section>

        <Section id="memoria" title="Memória">
          <p className="m-0 text-[14px] text-fg-muted">Lembrar o contexto dos seus projetos entre conversas ainda não existe. Chega junto com os Projetos.</p>
          <p className="m-0 text-[12.5px] text-fg-subtle">A memória de documentos (a base de conhecimento) já funciona: está na aba Biblioteca.</p>
        </Section>

        <Section id="privacidade" title="Privacidade e segurança">
          <p className="m-0 text-[14px] leading-relaxed text-fg-muted">
            {chat.available
              ? 'Suas mensagens são guardadas na sua conta (só você as vê) e enviadas à OpenAI para gerar cada resposta; com a base ativa, o texto da pergunta também é enviado para a busca. O CPF e os dados de compradores da trakfy não são enviados: só vai o que você escreve na conversa. Os documentos da biblioteca são compartilhados por todos que usam o Alfred.'
              : 'Enquanto o Alfred não está conectado a um modelo de IA, nenhuma mensagem é enviada nem guardada.'}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13.5px]">
            <li><Link href="/privacidade" className="text-fg underline underline-offset-2 hover:text-fg-muted">Política de privacidade</Link></li>
            <li><Link href="/termos" className="text-fg underline underline-offset-2 hover:text-fg-muted">Termos de uso</Link></li>
            <li><Link href="/exclusao-de-dados" className="text-fg underline underline-offset-2 hover:text-fg-muted">Exclusão de dados</Link></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
