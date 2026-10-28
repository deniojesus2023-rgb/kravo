# ALFRED — Strategic Intelligence (interface)

Módulo de consultoria estratégica dentro do mesmo app, em `/alfred`.

**Estado:** o **chat** está implementado (modelo da OpenAI, conversas salvas, histórico, renomear, excluir, limite diário), mas **ainda não rodou contra a OpenAI real**: foi testado só com o provedor simulado. Biblioteca (PDFs), Conhecimento e Projetos continuam só como interface, com estado vazio e botões desativados com o motivo na tela. Nenhum dado fictício é exibido.

## Decisões
- **Rota separada** (`app/alfred/`), com layout próprio. As telas da trakfy não foram alteradas; um teste e2e confere que a paleta e a marca da trakfy continuam as mesmas.
- **Tema escopado** em `app/alfred/alfred.css`: a classe `.alfred` redefine os mesmos tokens de `app/globals.css` com a paleta do Alfred (dourado `#E5C079` como `brand`; `profit`/`warn`/`loss` = sucesso/aviso/erro). Por isso as classes usuais (`bg-canvas`, `text-fg-muted`…) já saem na paleta certa dentro de `/alfred`.
- **Login**: `/alfred` usa a mesma conta e a proteção de rotas da trakfy (sem sessão vai para `/login`).
- **Dependência nova**: `lucide-react` (ícones, pedido na especificação). Markdown **sem biblioteca**: `lib/alfred/markdown.ts` é um parser próprio (títulos, listas, tabelas, citações, código, negrito/itálico, links http/https); o renderizador cria elementos React, nunca HTML bruto.

## Estrutura
- Rotas: `/alfred` (chat), `/alfred/c/[id]`, `/alfred/biblioteca[/id]`, `/alfred/conhecimento[/id]`, `/alfred/projetos[/id]`, `/alfred/configuracoes`.
- `lib/alfred/`: `types.ts`, `data.ts` (camada de dados, hoje vazia), `history.ts`, `markdown.ts`, `nav.ts`.
- `components/alfred/`: AlfredShell, AppSidebar, AppHeader, ConversationList, ChatWorkspace, ChatComposer, ChatMessage, ChatEmptyState, Markdown, CopyMessage, DocumentUpload, DocumentCard, DocumentDetail, DocumentProcessingStatus, KnowledgeSearch, KnowledgeCard, ConceptDetail, ProjectCard, ProjectOverview, ProjectTabs, SettingsPanel, `states.tsx` (EmptyState, LoadingState, ErrorState, ConfirmDialog, PendingNote, PageHeader, GoldButton), AlfredMark.

## Chat (implementado, não validado com a OpenAI real)
- **Variáveis de ambiente (Vercel):** `OPENAI_API_KEY` (segredo, só no servidor), `ALFRED_MODEL` (nome do modelo; sem ele o chat fica desativado) e, opcional, `ALFRED_DAILY_LIMIT` (padrão 50 mensagens por pessoa por dia, teto 1000).
- **Migração:** `supabase/migrations/20261028120000_alfred_conversas.sql` (`alfred_conversations`, `alfred_messages`, `alfred_usage` e as funções `alfred_consume`/`alfred_refund`). Rodar no SQL Editor **antes** do deploy.
- **Fluxo (`lib/alfred/chat.ts`):** valida (1 a 8.000 caracteres) → confere a conversa → conta a mensagem do dia → chama o modelo com o prompt do Alfred + até 30 mensagens/30.000 caracteres de contexto → só então grava a pergunta e a resposta. Se o modelo falha, nada é gravado, a cota volta e o texto volta ao campo.
- **Provedor:** `lib/alfred/model.ts` (interface `AlfredModel`; `createOpenAIModel` usa Chat Completions). Trocar de provedor = escrever outra função. Erros viram códigos fixos; nada do corpo da resposta, da chave ou da conversa vai a log ou mensagem.
- **Personalidade:** `lib/alfred/persona.ts`. O prompt proíbe inventar dados e diz que, nesta versão, o Alfred não tem acesso a documentos nem aos dados da trakfy.
- **Limite diário:** contador em `alfred_usage`, só escrito pelo servidor (apagar conversas não o zera). O dia é o de America/Sao_Paulo.
- **Privacidade:** o texto da conversa é enviado à OpenAI; a política de privacidade foi atualizada. Dados de compradores e CPF da trakfy não entram.
- Sem streaming: a resposta aparece inteira (indicador "analisando" enquanto isso). `maxDuration` do segmento é 60 s.

## O que falta conectar
| Recurso | Onde ligar |
|---|---|
| PDFs | `listDocuments`/`getDocument`, `capabilities.documents`, e `onFiles` + `limitsText` em `DocumentUpload`. O progresso exibido vem de `processedPages`/`failedPages` reais. |
| Conhecimento | `listConcepts`/`getConcept`, `capabilities.knowledge`. |
| Projetos | `listProjects`/`getProject`, criação de projeto (botão "Novo projeto" desativado), `capabilities.projects`. As abas Análises, Conversas, Documentos e Memória precisam das associações. |
| Anexos no chat | `capabilities.attachments` + tratamento no `ChatComposer`. |
| Preferências e memória | controles de `SettingsPanel` estão desabilitados até haver comportamento real. |

Antes de criar tabelas (conversas, documentos, conceitos, projetos), seguir a regra do `CLAUDE.md`: explicar as opções de esquema e pedir confirmação.

## Limitações conhecidas
- Anexos, upload de PDFs e criação de projetos **não executam nada** hoje (desativados de propósito).
- O chat não usa a Biblioteca nem os dados de ofertas da trakfy: responde só com o que está na conversa.
- Filtro de categoria e busca do Conhecimento existem, mas só têm o que filtrar quando houver conceitos.
- Testado com dados fictícios só em página temporária (removida) para conferir o visual; nenhuma integração real foi exercitada.
