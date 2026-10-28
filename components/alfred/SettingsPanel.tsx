import Link from 'next/link';
import type { ReactNode } from 'react';
import { capabilities } from '@/lib/alfred/data';

const SECTIONS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'preferencias', label: 'Preferências' },
  { id: 'modelos', label: 'Modelos de IA' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'memoria', label: 'Memória' },
  { id: 'privacidade', label: 'Privacidade e segurança' },
] as const;

const SOON = 'Disponível quando o recurso for implementado.';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="flex scroll-mt-6 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <h2 id={`${id}-t`} className="m-0 text-[16px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-fg-muted">{label}</label>
      {children}
    </div>
  );
}

const control = 'h-11 w-full max-w-[360px] rounded-lg border border-line-strong bg-canvas px-3 text-[14px] disabled:cursor-not-allowed disabled:opacity-50';

function Disabled({ children, text = SOON }: { children: ReactNode; text?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <p className="m-0 text-[12.5px] text-fg-subtle">{text}</p>
    </div>
  );
}

/**
 * Configurações. Controles sem comportamento real ficam desabilitados e explicados; só o que existe de fato
 * (a conta, o status dos recursos e os links de privacidade) é funcional.
 */
export function SettingsPanel({ email }: { email: string | null }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav aria-label="Seções das configurações" className="flex gap-1 overflow-x-auto lg:sticky lg:top-6 lg:w-[220px] lg:flex-none lg:flex-col">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="inline-flex h-10 flex-none items-center rounded-lg px-3 text-[13.5px] whitespace-nowrap text-fg-muted hover:bg-nav-hover hover:text-fg">{s.label}</a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Section id="perfil" title="Perfil">
          <Field id="cfg-email" label="E-mail da conta">
            <input id="cfg-email" readOnly value={email ?? 'Sem sessão iniciada'} className={`${control} read-only:opacity-100`} />
          </Field>
          <p className="m-0 text-[12.5px] text-fg-subtle">A conta é a mesma da trakfy. O e-mail é alterado pelo acesso da conta, não por aqui.</p>
        </Section>

        <Section id="preferencias" title="Preferências do Alfred">
          <Disabled>
            <div className="flex flex-col gap-4">
              <Field id="cfg-detalhe" label="Nível de detalhamento das respostas">
                <select id="cfg-detalhe" disabled className={control}><option>Padrão</option><option>Conciso</option><option>Detalhado</option></select>
              </Field>
              <Field id="cfg-idioma" label="Idioma">
                <select id="cfg-idioma" disabled className={control}><option>Português (Brasil)</option></select>
              </Field>
              <Field id="cfg-estilo" label="Estilo de apresentação">
                <select id="cfg-estilo" disabled className={control}><option>Análise estruturada</option><option>Conversa direta</option></select>
              </Field>
              <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" disabled className="size-4" />Citar referências documentais nas respostas</label>
            </div>
          </Disabled>
        </Section>

        <Section id="modelos" title="Modelos de IA">
          <p className="m-0 text-[14px] text-fg-muted">{capabilities.chat ? 'Modelo conectado.' : 'Nenhum modelo de IA conectado.'}</p>
          <p className="m-0 text-[12.5px] text-fg-subtle">A escolha de modelo aparece aqui quando a conversação estiver conectada.</p>
        </Section>

        <Section id="biblioteca" title="Biblioteca">
          <p className="m-0 text-[14px] text-fg-muted">{capabilities.documents ? 'Processamento de documentos conectado.' : 'Processamento de documentos não conectado.'}</p>
          <Link href="/alfred/biblioteca" className="w-fit text-[13.5px] text-brand underline underline-offset-2 hover:text-brand-hover">Abrir a Biblioteca</Link>
        </Section>

        <Section id="memoria" title="Memória">
          <Disabled>
            <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" disabled className="size-4" />Permitir que o Alfred lembre do contexto dos meus projetos</label>
          </Disabled>
        </Section>

        <Section id="privacidade" title="Privacidade e segurança">
          <p className="m-0 text-[14px] leading-relaxed text-fg-muted">Enquanto o Alfred não está conectado a um modelo de IA, nenhuma mensagem é enviada nem guardada.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13.5px]">
            <li><Link href="/privacidade" className="text-brand underline underline-offset-2 hover:text-brand-hover">Política de privacidade</Link></li>
            <li><Link href="/termos" className="text-brand underline underline-offset-2 hover:text-brand-hover">Termos de uso</Link></li>
            <li><Link href="/exclusao-de-dados" className="text-brand underline underline-offset-2 hover:text-brand-hover">Exclusão de dados</Link></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
