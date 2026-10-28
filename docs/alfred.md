# ALFRED — Strategic Intelligence (interface)

Módulo de consultoria estratégica dentro do mesmo app, em `/alfred`. **Só a interface existe.** Não há modelo de IA, processamento de PDFs, extração de conceitos nem armazenamento de projetos ou conversas: tudo isso mostra estado vazio e os botões que dependem disso ficam desativados com o motivo na tela. Nenhum dado fictício é exibido.

## Decisões
- **Rota separada** (`app/alfred/`), com layout próprio. As telas da trakfy não foram alteradas; um teste e2e confere que a paleta e a marca da trakfy continuam as mesmas.
- **Tema escopado** em `app/alfred/alfred.css`: a classe `.alfred` redefine os mesmos tokens de `app/globals.css` com a paleta do Alfred (dourado `#E5C079` como `brand`; `profit`/`warn`/`loss` = sucesso/aviso/erro). Por isso as classes usuais (`bg-canvas`, `text-fg-muted`…) já saem na paleta certa dentro de `/alfred`.
- **Login**: `/alfred` usa a mesma conta e a proteção de rotas da trakfy (sem sessão vai para `/login`).
- **Dependência nova**: `lucide-react` (ícones, pedido na especificação). Markdown **sem biblioteca**: `lib/alfred/markdown.ts` é um parser próprio (títulos, listas, tabelas, citações, código, negrito/itálico, links http/https); o renderizador cria elementos React, nunca HTML bruto.

## Estrutura
- Rotas: `/alfred` (chat), `/alfred/c/[id]`, `/alfred/biblioteca[/id]`, `/alfred/conhecimento[/id]`, `/alfred/projetos[/id]`, `/alfred/configuracoes`.
- `lib/alfred/`: `types.ts`, `data.ts` (camada de dados, hoje vazia), `history.ts`, `markdown.ts`, `nav.ts`.
- `components/alfred/`: AlfredShell, AppSidebar, AppHeader, ConversationList, ChatWorkspace, ChatComposer, ChatMessage, ChatEmptyState, Markdown, CopyMessage, DocumentUpload, DocumentCard, DocumentDetail, DocumentProcessingStatus, KnowledgeSearch, KnowledgeCard, ConceptDetail, ProjectCard, ProjectOverview, ProjectTabs, SettingsPanel, `states.tsx` (EmptyState, LoadingState, ErrorState, ConfirmDialog, PendingNote, PageHeader, GoldButton), AlfredMark.

## O que falta conectar (nada disso existe ainda)
| Recurso | Onde ligar |
|---|---|
| Modelo de IA / conversação | passar uma **server action** como `onSend` ao `ChatWorkspace` (`app/alfred/page.tsx`) e ligar `capabilities.chat`. Hoje o envio fica desativado. Função comum não funciona: o Next só aceita server action como prop de componente cliente. |
| Histórico, renomear, excluir | `listConversations`/`getConversation` em `lib/alfred/data.ts`; `ConversationList` já aceita `onRename`/`onDelete` (aparecem só quando entregues). Mensagens da conversa: `initialMessages` em `app/alfred/c/[id]/page.tsx`. |
| PDFs | `listDocuments`/`getDocument`, `capabilities.documents`, e `onFiles` + `limitsText` em `DocumentUpload`. O progresso exibido vem de `processedPages`/`failedPages` reais. |
| Conhecimento | `listConcepts`/`getConcept`, `capabilities.knowledge`. |
| Projetos | `listProjects`/`getProject`, criação de projeto (botão "Novo projeto" desativado), `capabilities.projects`. As abas Análises, Conversas, Documentos e Memória precisam das associações. |
| Anexos no chat | `capabilities.attachments` + tratamento no `ChatComposer`. |
| Preferências e memória | controles de `SettingsPanel` estão desabilitados até haver comportamento real. |

Antes de criar tabelas (conversas, documentos, conceitos, projetos), seguir a regra do `CLAUDE.md`: explicar as opções de esquema e pedir confirmação.

## Limitações conhecidas
- Anexos, upload, exclusão/renomeação e criação de projetos **não executam nada** hoje (desativados de propósito).
- Filtro de categoria e busca do Conhecimento existem, mas só têm o que filtrar quando houver conceitos.
- Testado com dados fictícios só em página temporária (removida) para conferir o visual; nenhuma integração real foi exercitada.
