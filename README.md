# Design das telas

Os arquivos em `screens/` foram feitos no canvas de design do Claude (formato `.dc.html`). São a **referência visual e de conteúdo**. Eles não rodam sozinhos fora do canvas (falta o runtime `support.js`), então o Claude Code deve **reescrever** cada tela no framework do projeto, copiando layout, espaçamentos, cores, textos e estados.

## Como ler um arquivo

- Estrutura em HTML com estilos inline e algumas classes no bloco `<helmet><style>`.
- `{{nome}}` é um ponto onde entra um valor do script ao final do arquivo.
- `<sc-for>` repete um bloco para cada item de uma lista; `<sc-if>` mostra um bloco condicionalmente.
- No final, `renderVals()` mostra os **dados de exemplo** e como são organizados. Use isso para desenhar os tipos e a camada de dados.
- `canvas.json` guarda o tamanho e a posição de cada tela no canvas.

## Telas

- `Main.dc.html`: Visão geral (KPIs, alerta, tabela de ofertas lado a lado, critérios)
- `Oferta.dc.html`: Dashboard da oferta (explicação da ação, KPIs, gráfico, funil, campanhas)
- `Criativos.dc.html`: grade de criativos, filtros, painel de detalhe
- `Rastreamento.dc.html`: saúde do Pixel e da API, Meta x Kiwify, eventos, UTM
- `Integracoes.dc.html`: Meta Ads (contas, permissões, validade) e plataformas de venda
- `NovaOferta.dc.html`: cadastro em etapas, script e padrão de UTM

## Pontos que não podem se perder

- Verde-limão `#C8F169` só em marca e CTA; lucro e positivo em `#34C78A`.
- Estados sempre com texto ("Escalar", "Dados insuficientes"), nunca só cor.
- Critérios, fonte, período, fuso e atraso de sincronização visíveis perto dos números.
- Valores entre colchetes, como `[ID DO PIXEL]`, são placeholders de dados reais ainda inexistentes.
- Os números de exemplo são consistentes entre si (ROAS, CPA e lucro batem com gasto e vendas). Mantenha essa consistência nos dados de teste.
