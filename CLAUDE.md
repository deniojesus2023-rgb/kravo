# kavro

SaaS de gestão, rastreamento e análise de ofertas de tráfego pago.
Slogan: **Cada oferta. Uma decisão.** (es: Cada oferta. Una decisión.)

Público: gestores de tráfego, infoprodutores e afiliados no Brasil e na América Latina.
Promessa: centralizar dados de mídia e vendas reais para decidir, oferta por oferta, o que escalar, manter ou pausar.
Personalidade: técnica, objetiva, precisa, confiável, direta, sem exageros. Não é planilha nem relatório genérico.

## Estado atual

- **Fase 1 (front-end com dados de exemplo)** concluída: Next.js + Tailwind v4, camada de dados de exemplo em `lib/data/`, regras puras e testadas em `lib/rules/`.
- **Fase 2 (Auth e banco)** em andamento: esquema, RLS e views em `supabase/migrations/` (ver `docs/banco.md`), testados num Postgres local, **ainda não aplicados** ao projeto Supabase. Login, cadastro e proteção de rotas implementados com `@supabase/ssr`, **ainda não testados contra o projeto real**. As telas continuam lendo os dados de exemplo. Nenhuma integração foi implementada.
- Os números das telas em `design/screens/` são **dados de exemplo**. Não os trate como reais.
- Nunca declare uma integração como concluída sem autenticação real e teste com dados reais.
- Antes de implementar qualquer tela, leia o arquivo dela em `design/screens/` (layout, textos, dados, estados).

## Leia nesta ordem

1. Este arquivo.
2. `brand/manual-de-marca.txt` (marca, paleta, tipografia, tom de voz).
3. `design/README.md` e `design/screens/*.dc.html`.
4. `docs/arquitetura.md` (modelo de dados e integrações).

## Stack proposta (confirmar antes de começar)

- Next.js (App Router) + TypeScript
- Supabase (Postgres, Auth, Row Level Security)
- Vercel (deploy) e jobs agendados para sincronizar dados
- Geist Sans e Geist Mono (`next/font`)

## Telas e rotas

| Tela | Rota | Arquivo de design |
|---|---|---|
| Visão geral | `/` | `Main.dc.html` |
| Dashboard da oferta | `/ofertas/[id]` | `Oferta.dc.html` |
| Criativos | `/ofertas/[id]/criativos` | `Criativos.dc.html` |
| Rastreamento | `/ofertas/[id]/rastreamento` | `Rastreamento.dc.html` |
| Integrações | `/integracoes` | `Integracoes.dc.html` |
| Nova oferta | `/ofertas/nova` | `NovaOferta.dc.html` |

Todas compartilham a mesma sidebar (marca, navegação, lista de ofertas com ROAS e estado, status do Meta Ads). Selecionar uma oferta muda o escopo de todos os dados da tela.

## Marca

- Logo: monograma K (haste vertical + duas diagonais) e wordmark "kavro" em caixa baixa. Arquivos em `brand/`.
- Horizontal no login, landing e cabeçalho institucional. Monograma no menu recolhido, favicon e app.
- Área de respiro mínima: largura da haste do K. Não esticar, inclinar, sombrear, aplicar gradiente nem recolorir.
- Fundo claro: usar versão monocromática grafite.

### Paleta

| Uso | Cor |
|---|---|
| Fundo principal | `#0F1114` |
| Superfícies e cards | `#1A1E23` |
| Bordas | `#272D33` ou `#30353B` |
| Marca / CTA | `#C8F169` |
| Texto principal | `#F5F7F8` |
| Texto secundário | `#A7ADB5` |
| Lucro / positivo | `#34C78A` |
| Prejuízo / negativo | `#F16D75` |
| Atenção | `#E8B75B` |

Regras: o verde-limão é cor de marca (CTA, foco, aba ativa, logo), **nunca** sinônimo de lucro. Positivo usa `#34C78A`. Estados sempre com texto, não só cor.

### Tipografia

Geist Sans para interface. Geist Mono, com numerais tabulares, para valores, CPA, ROAS, datas e métricas. Títulos de página 24–28px, KPIs 26–32px, tabelas 12–14px, texto 14px.

### Interface

Dark-first, responsiva (sidebar recolhível, tabelas com rolagem horizontal, KPIs em grid adaptativo), acessível (foco visível, teclado, rótulos, contraste). Sem gradientes, glassmorphism, emojis, sombras exageradas ou ilustrações genéricas. Ícones lineares discretos.

## Regras de negócio

### Lucro líquido

`lucro = receita aprovada − reembolsos − gasto em mídia − taxas e custos cadastrados`

Na V1 taxas e custos ainda não são cadastrados: mostrar o aviso "Taxas e custos de produto ainda não cadastrados". A fórmula deve estar visível na interface.

### ROAS

Dois valores, sempre separados: **ROAS reportado pelo Meta** e **ROAS real** (pedidos aprovados da plataforma de vendas ÷ gasto). O lucro usa o valor real. Nunca tratar o ROAS do Meta como prova de lucro.

### Ação por oferta (valores iniciais, configuráveis)

Precedência: Pausar, depois Dados insuficientes, depois Escalar, depois Manter.

- **Pausar**: lucro negativo E (gasto ≥ R$ 2.000 OU pelo menos 30 vendas). Com 30 vendas ou mais o prejuízo já está confirmado; com poucas vendas, o gasto mínimo basta.
- **Dados insuficientes**: menos de 30 vendas no período (inclui prejuízo com poucas vendas e gasto abaixo de R$ 2.000).
- **Escalar**: ROAS ≥ 2,5x, ao menos 50 vendas e reembolso ≤ 10%.
- **Manter**: o restante (por exemplo ROAS entre 1,0x e 2,5x).

Toda indicação mostra os critérios, o período e a fonte. Nunca prometer lucro garantido nem certeza sobre recomendação automática.

### Criativos

- **Destaque**: maior ROAS entre criativos com ao menos 15 vendas.
- **Revisar**: ROAS < 2,0x com gasto ≥ R$ 250.
- **Dados insuficientes**: gasto < R$ 250 e menos de 5 vendas.
- Hook rate = visualizações de 3 segundos ÷ impressões (só vídeo).

### Rastreamento e confiabilidade

- Meta Pixel + API de Conversões, com deduplicação por `event_id`.
- Padronizar UTMs e reconciliar anúncios com pedidos efetivos da plataforma de vendas.
- Divergências e dados ausentes são **estados visíveis**. Nunca inventar valores.
- Sempre exibir moeda (BRL), fuso (America/Sao_Paulo), janela de atribuição, atraso de sincronização e fonte dos números.

### Alertas

Todo alerta mostra gravidade, motivo, ação recomendada e data de atualização.

## Integrações

- **Meta**: login oficial (OAuth). Permissões `ads_read` e `ads_management`. Token de longa duração (~60 dias): avisar para reconectar antes de expirar. Para usuários externos é preciso **Acesso Avançado** (verificação do negócio + revisão do app, com vídeo, política de privacidade, termos e URL de exclusão de dados). Começar esse pedido cedo.
- **Plataformas de venda**: Kiwify, Hotmart, Eduzz, Shopify. Verificar APIs, autenticação, webhooks e limites de cada uma antes de implementar.

## Segurança e dados

- Tokens criptografados, nunca em log, nunca no front-end.
- Isolamento por usuário em todas as tabelas (RLS).
- Respeitar LGPD: exclusão de dados sob pedido.
- A kavro só lê métricas e envia eventos. Não cria, edita nem pausa anúncios.

## Como trabalhar

- Idioma da interface: português do Brasil. Espanhol entra depois.
- Passos pequenos e verificáveis. Rodar e testar antes de dizer que terminou.
- Dados de exemplo ficam numa camada de dados tipada e isolada, para trocar pela fonte real sem mexer nas telas.
- Antes de decisões difíceis de desfazer (esquema do banco, bibliotecas grandes, permissões da Meta), explique as opções e peça confirmação.
- Marcar placeholders como `[ASSIM]` quando faltar um dado real (IDs, URLs, domínios).
