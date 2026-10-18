# Arquitetura inicial da kavro

Proposta de partida. Confirmar antes de implementar.

## Princípio

A **oferta** está no centro. Quase toda tabela carrega `offer_id` e `user_id`. Trocar de oferta na interface é filtrar por `offer_id`. Isolamento entre usuários por Row Level Security em `user_id`.

## Tabelas

| Tabela | O que guarda |
|---|---|
| `profiles` | usuário (ligado ao Auth), nome, idioma, fuso, moeda |
| `offers` | nome, nicho, preço, plataforma de venda, link do checkout, status, parâmetros de decisão (limites configuráveis) |
| `meta_connections` | conexão Meta do usuário: token **criptografado**, data de expiração, permissões concedidas, status |
| `ad_accounts` | contas de anúncio visíveis ao usuário, se estão selecionadas, BM |
| `pixels` | pixels por conta de anúncio, ligados à oferta |
| `sales_connections` | conexão com Kiwify, Hotmart, Eduzz, Shopify: credenciais criptografadas, status, última sincronização |
| `campaigns`, `adsets`, `ads` | estrutura do Meta, com `offer_id` (pelo padrão de nome OFERTA_ESTRUTURA_PÚBLICO ou vínculo manual) |
| `creatives` | criativo (formato, duração, nome padronizado), ligado ao anúncio |
| `daily_metrics` | métricas por dia e por nível (campanha, conjunto, anúncio, criativo): gasto, impressões, cliques, CPM, CPC, CTR, frequência, views de 3 s |
| `orders` | pedidos vindos das plataformas: oferta, valor, status (aprovado, reembolsado, chargeback), UTMs, `event_id`, data |
| `tracking_events` | eventos recebidos (página, checkout, compra): origem (Pixel, API), `event_id`, campanha, valor, status de deduplicação |
| `sync_runs` | cada sincronização: fonte, início, fim, resultado, atraso, erro |
| `alerts` | gravidade, motivo, ação recomendada, oferta, data de atualização |

## Fluxos

### Conexão com o Meta
1. Usuário clica em "Conectar com Facebook" e autoriza no login oficial da Meta.
2. O servidor troca o código por token de longa duração e guarda criptografado.
3. Lista as contas de anúncio; o usuário escolhe quais ler.
4. Jobs agendados (de hora em hora) puxam métricas com o token de cada usuário e gravam em `daily_metrics`.
5. Perto da expiração, a interface pede para reconectar.

Pré-requisito para usuários externos: Acesso Avançado (verificação do negócio + revisão do app).

### Vendas
Webhook (ou leitura da API) de cada plataforma grava em `orders` com UTMs. Reembolso e chargeback atualizam o pedido existente.

### Rastreamento
- Script na página de vendas gera o evento no navegador com um `event_id`.
- O servidor envia o mesmo evento pela API de Conversões com o mesmo `event_id` (deduplicação).
- `tracking_events` registra origem e status de cada evento.
- UTM padrão: `utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}`.

### Reconciliação
Por oferta e período, comparar compras no Meta com pedidos aprovados da plataforma. Mostrar diferença, ROAS reportado versus ROAS real e causas possíveis. Nunca corrigir em silêncio.

## Cálculos (funções puras e testadas)

- lucro líquido, ROAS real, CPA, ticket médio, taxa de reembolso
- ação da oferta (Escalar, Manter, Pausar, Dados insuficientes) com os critérios que a justificam
- selo de criativo (Destaque, Revisar, Dados insuficientes)

Regras e limites iniciais estão em `CLAUDE.md`.

## Ordem sugerida

1. Front-end com dados de exemplo.
2. Auth e banco com RLS.
3. Conexão com o Meta e sincronização de métricas.
4. Plataformas de venda e reconciliação.
5. API de Conversões, deduplicação e alertas.

Em paralelo, desde o início: pedido de Acesso Avançado na Meta.
