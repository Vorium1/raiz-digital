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

Correção adicional de CI: a primeira execução remota do #130 passou tipos, regressões e
migrations/RLS, mas o build falhou em `next/font/google` ao extrair extensão de URL recebida.
Sora e Inter oficiais (Latin WOFF2) agora são distribuídas localmente com licenças SIL OFL1.1,
origem e SHA-256 em `src/app/fonts/README.md`; `next/font/local` preserva variáveis/estilos
existentes e elimina dependência de Google Fonts durante o build. Nenhuma fonte substituída.


## Fase 3 — #126: reconstrução da decisão agronômica

Branch `feature/agronomic-decision-timeline`, baseada no corte verde da Calculadora.
A linha do tempo consulta os registros existentes com escopo tenant/talhão e inclui
**todas** as revisões de interpretação, coleta, laboratório/importação/conferência,
prescrição/revisão, recomendação, cenários salvos, publicação, aplicação e acompanhamento.
Não cria tabela, migration, histórico paralelo ou execução de regra agronômica.

Regra/versão/hash vêm exclusivamente do trace congelado da revisão. Responsável é
obtido pelo vínculo do evento. Ausência de vínculo imutável com importação, ausência de
safra em produtividade/NDVI e conteúdo histórico não preservado ficam explícitos.
Eventos de auditoria complementam revisões não representadas pelo timestamp vigente;
payloads privados, identidades globais completas e chaves de armazenamento não são expostos.

Interface carregada ao abrir a aba; filtros por tipo/período e safra, calendário local
preservando datas sem hora, agrupamento por dia, fontes e limitações. Falhas permitem
nova tentativa; navegação cancela requisição obsoleta. API privada sem cache e 404 para
campo ausente/de outra empresa. Nenhuma escrita de dados pelo fluxo.

Validação: testes de filtros/ordenação, React/retry/cancelamento, sessão/rota e integração
PostgreSQL real com fixtures E2E revertidas. Integração comprova duas revisões, responsáveis,
vínculo decisão/evidência, regra congelada após mudança de catálogo e isolamento entre
dois tenants sob `raiz_app`. Harness recusa conexão de banco externa. Suíte handoff passou.
Fixtures visuais limitadas ao banco local, marcadas E2E, geometria vazia; sem coordenadas,
quantidades agronômicas ou execução do motor.


Encerramento solicitado por limite de cota: build local passou; browser desktop/mobile
passou filtros e isolamento, sem overflow/pageerror. Ajuste final apenas CSS para usar
tokens de contraste do tema e controles mobile16px/44px, após build local; teste UI
reexecutado. CI do HEAD final deve confirmar build desse ajuste. Dev encerrado. Sem
merge, produção ou migration externa. Retomada: conferir CI do HEAD da branch #126,
corrigir eventual falha determinística e repetir captura visual do contraste final.
