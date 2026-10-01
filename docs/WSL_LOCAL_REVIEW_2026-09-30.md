# Revisão local oficial WSL2 — 2026-09-30

## Ambiente e fonte de verdade

Clone oficial `/home/guilherme/projects/raiz-digital`, Linux WSL2. Git 2.53.0,
GitHub CLI 2.46.0, Node 22.23.3, npm 10.9.9 e Codex CLI 0.159.3.
Fetch HTTPS confirmado com autenticação OAuth existente, sem PAT e sem helper Windows.
Base preservada: `origin/work/codex-night-multitenant-2026-09-30` em `2ab4c590`.
Nenhum commit do antigo ambiente Windows foi recuperado.

## #128 / PR #129

Corrigidos problemas reproduzíveis:

- CPF/CNPJ duplicado retorna 409; documento com letras, país inválido e JSON inválido são rejeitados.
- Erros internos do banco não são expostos pelas rotas de clientes.
- Edição conserva ausência de país legado, observações e contador real de análises; formulário captura referência antes de await.
- Criação de propriedade/talhão trata pai de outro tenant como ausente, com 404.
- Análise valida laboratório ativo do tenant ou global antes de inserir (FK simples não bastava).
- Equipe mostra somente atividade de login na própria empresa.
- Alterações de equipe revalidam autorização na transação sob trava da empresa, compartilhada
  com o primeiro administrador; último administrador e SUPER_ADMIN continuam protegidos.
- Falha de envio de convite do primeiro administrador mantém confirmação do vínculo criado.
- Cliente 360° inclui identificação completa, estrutura, safras registradas, análises,
  publicações e auditoria relacionada sem metadata/identidade global.

Validação:

- `test:handoff` aprovado localmente.
- Regressões executáveis de clientes, equipe, vínculos de análise, RBAC de catálogo e
  contratos de administração global/privacidade aprovadas.
- PostgreSQL 18.6/PostGIS 3.6.2 isolados em `/tmp`: migrations 001–046 aplicadas;
  `scripts/test-multitenant-rls.sql` aprovado com `raiz_app`, sem BYPASSRLS.
  Fixtures E2E do teste SQL revertidas por rollback.
- HTTP real com dois administradores E2E locais: isolamento de clientes e pais, acesso global
  negado ao tenant admin e observações preservadas.
- Navegador real: login, lista e Cliente 360° desktop/mobile; sem overlay, erros de navegador
  ou overflow horizontal em 390×844. Screenshots locais em `/tmp/raiz-client360-*.png`.
- Typecheck e build finais aprovados localmente.
- CI passa a criar PostGIS descartável, aplicar migrations e executar o teste RLS.

Não foram usadas conexões de banco externas. Não houve merge, deploy de produção,
migration de produção ou criação de contas operacionais reais.

A visualização de publicações mostra revisão/data e leva ao relatório da análise;
não afirma abrir um snapshot específico de revisão. Safras são listadas como registradas,
sem inferir que a mais recente seja a atual.

## #130 / PR #131 — Calculadora RAIZ

Branch remota `feature/calculadora-raiz-v1` preservada e atualizada por merge normal
com #128 (sem rebase/force-push, sem merge de PR). Conflitos de CI/navegação resolvidos
mantendo ambas as funcionalidades e todos os testes.

- Quantidades/garantias/PRNT iniciais vazios; somente prefill explícito é reutilizado.
- Texto inválido não é descartado como ausência; motor valida área, garantia, dose e preço.
- Calcário de catálogo utiliza exclusivamente seu PRNT/preço, sem fallback manual oculto.
- Avisos de limites operacionais e diferenças P/K são exibidos; totais por produto aparecem.
- Conversão inversa de calcário recebe área/preço e reutiliza o motor existente.
- Custos totais de produto/calcário/dupla PK usam valores brutos, arredondando somente a saída.
- Controles responsivos corrigidos após overflow observado no navegador em390px;
  rótulos e resultados com contraste/tamanho legíveis.

Regressões do motor e render real React aprovadas (`test:calculator`, `test:calculator-ui`,
`test:commercial-input`, `test:commercial-comparison`, `test:handoff`). Navegador real validou
os cinco modos, vírgula decimal, área inválida, avisos, tenant isolation do catálogo e
produto manual sem persistência. Fixtures E2E sintéticas de composição/preço foram usadas
somente no banco local descartável; não são cadastro comercial real ou regra agronômica.
Screenshots locais: `/tmp/raiz-calculator-desktop.png` e `/tmp/raiz-calculator-mobile.png`.
Nenhuma conexão externa de banco ou alteração em prescrição/relatório oficial.
