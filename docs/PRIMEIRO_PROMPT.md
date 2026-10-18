# Primeiro prompt para o Claude Code

Cole o texto abaixo na primeira sessão, com a pasta `kavro-handoff` já dentro do projeto.

---

Leia `CLAUDE.md`, `brand/manual-de-marca.txt`, `design/README.md` e as telas em `design/screens/`. Depois me diga, em poucas linhas, o que entendeu do produto e da marca.

Em seguida, antes de escrever código, me proponha um plano para a **Fase 1: front-end com dados de exemplo**, e me pergunte o que for preciso confirmar (stack, estrutura de pastas, biblioteca de gráficos).

Escopo da Fase 1:
1. Criar o projeto (Next.js + TypeScript) e configurar Geist Sans e Geist Mono.
2. Transformar a paleta e a tipografia do manual em tokens de design reutilizáveis.
3. Implementar o layout compartilhado: sidebar (logo, navegação, lista de ofertas com ROAS e estado, status do Meta Ads), responsivo e acessível.
4. Implementar as telas **Visão geral** e **Dashboard da oferta**, fiéis ao design.
5. Os dados de exemplo ficam numa camada tipada e isolada (`/lib/data`), com tipos que já sigam `docs/arquitetura.md`.
6. As regras de Escalar/Manter/Pausar/Dados insuficientes e a fórmula do lucro ficam em funções puras e testadas.

Critérios de pronto:
- Visual igual ao design, sem gradientes nem cores fora da paleta.
- Verde-limão só em marca e CTA. Lucro e positivo em `#34C78A`.
- Navegação por teclado, foco visível, contraste adequado.
- Funciona de 390px a 1440px de largura.
- Testes das funções de regra passando.

Não implemente integrações, login nem banco nesta fase. Quando terminar, liste o que ficou de fora e proponha a Fase 2.
