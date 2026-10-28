# ALFRED — Strategic Intelligence (interface)

Módulo de consultoria estratégica dentro do mesmo app, em `/alfred`.

**Estado:** o **chat** está implementado (modelo da OpenAI, conversas salvas, histórico, renomear, excluir, limite diário) e **foi confirmado funcionando em produção** pelo usuário. A **base de conhecimento de PDFs** também está implementada (envio, leitura única, trechos com embedding, busca no chat com Fontes), e a leitura de PDFs também foi confirmada em produção; **a qualidade da busca ainda não foi avaliada** com perguntas reais. Conhecimento (extração de conceitos) e Projetos continuam só como interface, com estado vazio. Nenhum dado fictício é exibido.

## Decisões
- **Dentro da trakfy:** o Alfred é uma seção do app, não um produto separado. Fica no menu lateral da trakfy (item "Alfred") e as rotas `/alfred/*` moram em `app/(app)/alfred/`, sob o mesmo layout (`AppShell`, sidebar, login, proteção de rotas). As seções (Chat, Biblioteca, Conhecimento, Projetos, Configurações) são **abas** no topo (`AlfredChrome`), como as abas de uma oferta. No chat, o histórico fica numa coluna à esquerda (≥1024px) ou na janela "Conversas" no celular. O `AppShell` dá altura total às rotas `/alfred` (chat com campo fixo embaixo e rolagem própria).
- **Mesma identidade visual da trakfy:** usa os tokens de `app/globals.css`, os raios (8px) e os componentes da trakfy; não há tema próprio. O verde-limão aparece só no botão principal, na aba ativa, no foco e na marca; estados com texto, sem gradientes. Os testes e2e de paleta, acessibilidade e rolagem horizontal da trakfy (`e2e/app.spec.ts`) também cobrem as telas do Alfred.
- **Interface mais enxuta:** chat centrado em coluna de leitura (720px), sugestões em lista com divisórias finas em vez de cartões, campo de mensagem único, respostas sem moldura, títulos de seção analítica (DIAGNÓSTICO…) em rótulos discretos.
- **Dependência:** `lucide-react` (ícones). Markdown **sem biblioteca**: `lib/alfred/markdown.ts` é um parser próprio (títulos, listas, tabelas, citações, código, negrito/itálico, links http/https); o renderizador cria elementos React, nunca HTML bruto.

## Estrutura
- Rotas: `/alfred` (chat), `/alfred/c/[id]`, `/alfred/biblioteca[/id]`, `/alfred/conhecimento[/id]`, `/alfred/projetos[/id]`, `/alfred/configuracoes`.
- `lib/alfred/`: `types.ts`, `data.ts` (camada de dados, hoje vazia), `history.ts`, `markdown.ts`, `nav.ts`.
- `components/alfred/`: AlfredChrome (abas + histórico), ConversationList, ChatWorkspace, ChatComposer, ChatMessage, ChatEmptyState, Markdown, CopyMessage, DocumentUpload, DocumentCard, DocumentDetail, DocumentProcessingStatus, KnowledgeSearch, KnowledgeCard, ConceptDetail, ProjectCard, ProjectOverview, ProjectTabs, SettingsPanel, `states.tsx` (EmptyState, LoadingState, ErrorState, ConfirmDialog, PendingNote, PageHeader, GoldButton), AlfredMark.

## Chat (implementado e confirmado em produção)
- **Variáveis de ambiente (Vercel):** `OPENAI_API_KEY` (segredo, só no servidor), `ALFRED_MODEL` (nome do modelo; sem ele o chat fica desativado) e, opcional, `ALFRED_DAILY_LIMIT` (padrão 50 mensagens por pessoa por dia, teto 1000).
- **Migração:** `supabase/migrations/20261028120000_alfred_conversas.sql` (`alfred_conversations`, `alfred_messages`, `alfred_usage` e as funções `alfred_consume`/`alfred_refund`). Rodar no SQL Editor **antes** do deploy.
- **Fluxo (`lib/alfred/chat.ts`):** valida (1 a 8.000 caracteres) → confere a conversa → conta a mensagem do dia → chama o modelo com o prompt do Alfred + até 30 mensagens/30.000 caracteres de contexto → só então grava a pergunta e a resposta. Se o modelo falha, nada é gravado, a cota volta e o texto volta ao campo.
- **Provedor:** `lib/alfred/model.ts` (interface `AlfredModel`; `createOpenAIModel` usa Chat Completions). Trocar de provedor = escrever outra função. Erros viram códigos fixos; nada do corpo da resposta, da chave ou da conversa vai a log ou mensagem.
- **Personalidade:** `lib/alfred/persona.ts`. O prompt proíbe inventar dados e diz que, nesta versão, o Alfred não tem acesso a documentos nem aos dados da trakfy.
- **Limite diário:** contador em `alfred_usage`, só escrito pelo servidor (apagar conversas não o zera). O dia é o de America/Sao_Paulo.
- **Privacidade:** o texto da conversa é enviado à OpenAI; a política de privacidade foi atualizada. Dados de compradores e CPF da trakfy não entram.
- Sem streaming: a resposta aparece inteira (indicador "analisando" enquanto isso). `maxDuration` do segmento é 60 s.

## Base de conhecimento (PDFs): implementada; leitura confirmada, qualidade da busca a avaliar
**Ideia:** cada PDF é lido **uma vez**; o texto vira trechos (~1.200 caracteres, por página, com sobreposição) guardados com um *embedding* (vetor de 1536 números). A cada pergunta, o chat busca os trechos mais relevantes de **todos** os documentos e os entrega ao modelo como material de consulta. O Alfred não "lembra" de tudo de cabeça: ele consulta a base. Cada PDF novo aumenta a base sem reler os antigos.
- **Compartilhada:** todos os usuários logados consultam a mesma base (pelo Alfred). **Só administradores** (`ALFRED_ADMIN_EMAILS`) enviam, reprocessam e excluem. Sem essa variável, ninguém envia. O texto dos trechos **não é legível pelo navegador** (sem permissão na tabela); a busca roda no servidor e devolve só os poucos trechos de cada pergunta.
- **Variáveis (Vercel):** `OPENAI_API_KEY`, `ALFRED_EMBEDDING_MODEL` (nome do modelo de embedding; precisa aceitar `dimensions: 1536`, que é o tamanho fixo da coluna), `ALFRED_ADMIN_EMAILS` (e-mails separados por vírgula), além do `SUPABASE_SERVICE_ROLE_KEY` que já existe.
- **Migrações (rodar no SQL Editor, nesta ordem, antes do deploy):** `20261029120000_alfred_base_de_conhecimento.sql` (extensão `vector`, `alfred_documents`, `alfred_chunks`, coluna `sources` em `alfred_messages`, bucket privado `alfred-documents`) e `20261029120100_alfred_busca.sql` (índices HNSW e GIN e a função `alfred_search_chunks`).
- **Envio:** o navegador sobe o PDF direto ao armazenamento privado com link assinado (o servidor do app tem limite de corpo), até 50 MB e 2.000 páginas. O original é guardado; só o servidor o acessa.
- **Leitura em partes** (`lib/alfred/ingest.ts`): até 12 páginas ou ~30 s por passo; o navegador repete o passo até terminar, com o progresso real (páginas lidas, sem texto, com falha). Retoma de onde parou ("Continuar leitura"), uma trava impede dois processamentos juntos, e repetir um passo não duplica trechos. **Mantenha a aba aberta** durante a leitura.
- **Estados honestos:** página que falha entra em "Parcial" com a lista de páginas; página sem texto (capa, imagem) conta à parte; PDF sem nenhum texto (escaneado) termina em "Erro: sem texto". **Não há OCR.** Arquivo que não é PDF, protegido por senha, duplicado (SHA-256) ou grande demais viram erro com texto claro.
- **No chat** (`lib/alfred/knowledge.ts`, `persona.ts`): embedding da pergunta (+ a pergunta anterior do usuário) → busca híbrida (significado + palavras em português, fusão RRF) → até 8 trechos no prompt como **dados, não instruções** (injeção por PDF) → o modelo cita `[n]` → só as fontes realmente citadas viram "Fontes" (documento e página). Se a busca falhar, o Alfred responde sem a base e **avisa na própria resposta**.
- **Limites conhecidos:** a busca por palavras não ignora acento (a busca por significado cobre isso); a relevância não tem corte numérico (o prompt manda ignorar trecho irrelevante); com muitos PDFs a qualidade da busca precisa de ajuste com perguntas reais; trechos de livros protegidos são servidos a todos os usuários em pedaços (o prompt manda parafrasear, mas a responsabilidade pelos direitos autorais dos PDFs enviados é de quem envia).
- **Testes:** os testes de banco usam um substituto simples do pgvector (o PGlite desta versão não o traz; ver `tests/db/harness.ts`): validam esquema, permissões e a lógica da busca, **não o pgvector real**. A sintaxe das migrações (`extensions.vector`, `hnsw`, operador `<=>`) segue a documentação do pgvector/Supabase, mas só foi exercitada no substituto.

## O que falta conectar
| Recurso | Onde ligar |
|---|---|
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
