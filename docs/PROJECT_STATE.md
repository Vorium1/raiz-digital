# Estado do Projeto — RAIZ Digital

Data do handoff: 2026-09-01
Última auditoria registrada: 2026-09-02 (Claude Code, banco real via Supabase)

## Estado executivo

| Área | Estado | Observação |
|---|---|---|
| Identidade visual | Consolidada | Guia oficial incluído |
| Navegação/UX base | Implementada | Desktop + mobile |
| PostgreSQL/PostGIS | Validado em banco real | Migrations 001-006 aplicadas contra Supabase (dev); grid PostGIS/UTM testado com talhão real |
| Multiempresa | Validado E2E com 2 tenants | Testado via API real (login + criação + listagem cruzada) |
| RLS | Corrigida e validada | Ver "Correção crítica de RLS" abaixo — estava sem efeito prático até esta auditoria |
| Login/sessão | Validado real | Login, senha incorreta, sessão sem cookie e logout testados via HTTP real. Falta endurecimento comercial (2FA, recuperação de senha) |
| Clientes | Persistência inicial, validada | CRUD inicial testado via API real |
| Propriedades | API inicial, validada | Editor visual de polígono (mapa Leaflet) disponível; boundary opcional |
| Talhões | PostGIS + API inicial, validada | Área em hectare calculada corretamente pelo PostGIS em teste real; editor visual de polígono (mapa Leaflet, desenho por clique) implementado e testado |
| Safras | Persistência inicial, validada | Integrada ao fluxo de análise |
| Análises | Persistência inicial | Sem parecer oficial automático |
| Importação laboratório CSV | Implementada | CSV longo/amplo; ainda faltam XLSX/PDF |
| Normalização laboratório | Implementada parcialmente | Biblioteca de métodos ainda precisa homologação |
| Índice de confiança | Base técnica existente | Integrar ao motor homologado |
| Operações de campo v0.5 | Auditada e validada em banco real | Ver "Auditoria do bloco v0.5" abaixo |
| Motor agronômico | Contrato definido | Rule set oficial ainda não implementado/homologado |
| Revisão/aprovação | UI/base conceitual | Fluxo executável ainda pendente |
| Relatório PDF | Pendente | Não simular como pronto |
| Storage S3 | Pendente | Arquivo bruto ainda precisa storage real |
| Worker/fila | Pendente | Preferência inicial: PostgreSQL |
| 2FA/recuperação | Pendente | Obrigatório antes de produção |
| Pagamentos | Apenas base/contrato | Não priorizar antes do núcleo agronômico |
| E2E real | Feito para login, multiempresa e operações de campo | Falta laboratório→interpretação→relatório |

## Última baseline confiável

**v0.4** é a referência consolidada. O diretório atual inclui mudanças de v0.5 ainda não homologadas.

## Mudanças v0.5 presentes neste snapshot

- `db/migrations/004_field_operations.sql`
- `scripts/test-field-operations.mjs`
- `src/domain/field-operations.ts`
- `src/lib/repositories/collections.ts`
- `src/app/api/collection-orders/**`
- `src/components/field-operations-manager.tsx`
- alterações em `src/app/(platform)/coletas/page.tsx`
- alterações em `src/lib/repositories/catalog.ts`
- alterações de estilo em `src/app/globals.css`

Consulte `V0.5_INTERRUPTED.md` antes de aceitar esse bloco.

## Banco de desenvolvimento: Supabase Free (decisão registrada)

O ambiente local não tinha Docker/WSL2 disponível. Por decisão do responsável pelo projeto, o banco de
desenvolvimento passou a ser um projeto **Supabase Free** (`raiz-digital-dev`, região `sa-east-1`), usado
**apenas como PostgreSQL/PostGIS hospedado** — sem API de Dados, sem `supabase-js`, sem Auth/Storage do
Supabase. A stack de código continua 100% Postgres puro via `pg`; a conexão é substituível por qualquer
outro Postgres (self-hosted incluído) trocando apenas as variáveis de ambiente. Isso está registrado aqui
porque `CLAUDE.md` lista "Supabase" entre os itens a não introduzir por conveniência; a leitura adotada foi
a de que hospedar apenas o banco, sem lock-in de plataforma, é compatível com essa regra. Se o projeto
adotar qualquer outro recurso do Supabase além do Postgres hospedado, isso exige nova decisão explícita.

Notas técnicas do Supabase Free relevantes para reproduzir o ambiente:
- A conexão "Direct connection" do Supabase é somente IPv6; em rede só-IPv4 use a opção **"Session pooler"**.
- O papel `postgres` do Supabase tem o atributo `BYPASSRLS` (ver correção abaixo).

## Correção crítica de RLS (migrations 005 e 006)

Ao validar RLS com dois tenants reais (exigência do `CLAUDE.md`), a primeira tentativa mostrou que o
isolamento **não estava em vigor**: com o contexto de tenant A configurado, a consulta ainda retornava
linhas do tenant B. Causa raiz, confirmada por teste direto no banco:

1. As migrations 001-004 ligavam RLS (`ENABLE ROW LEVEL SECURITY`) mas nunca forçavam a política para o
   dono da tabela (`FORCE ROW LEVEL SECURITY`). No PostgreSQL, o dono de uma tabela ignora RLS por padrão.
2. Além disso, o papel usado para migrations (`postgres` no Supabase; `raiz` no `compose.yaml` local, que
   nasce superusuário na imagem oficial do Postgres) tem o atributo `BYPASSRLS`/superusuário, que ignora
   RLS mesmo com `FORCE ROW LEVEL SECURITY`.

Ou seja: o isolamento multiempresa nunca esteve realmente ativo nas versões anteriores — nem localmente,
nem seria ativo em qualquer ambiente que reaproveitasse o mesmo papel de migrations para a aplicação.

Correção aplicada:
- `db/migrations/005_force_row_level_security.sql`: aplica `FORCE ROW LEVEL SECURITY` em todas as tabelas
  com política de tenant.
- `db/migrations/006_app_runtime_role.sql`: cria o papel `raiz_app` (login, sem `BYPASSRLS`, sem ser dono
  de tabelas, privilégios apenas de `SELECT/INSERT/UPDATE/DELETE`), que passa a ser o papel usado pela
  aplicação em runtime. A senha é definida à parte, fora do Git, com `npm run db:set-app-password`
  (variável `APP_DB_ROLE_PASSWORD`).
- `src/lib/db.ts`: a aplicação agora conecta usando `APP_DATABASE_URL` (papel restrito), com fallback para
  `DATABASE_URL` (papel administrativo) apenas se a variável restrita não estiver configurada — isso é uma
  transição segura, não uma permissão para pular a configuração do papel restrito em qualquer ambiente novo.
- `scripts/migrate.mjs` e `scripts/seed-dev.mjs` continuam usando `DATABASE_URL` (papel administrativo),
  como já era — precisam de privilégio de DDL.

**Reteste após a correção**: com o papel `raiz_app`, tenant A só enxerga seus próprios dados, tenant B só
os dele, e sem contexto de tenant definido a consulta não retorna nenhuma linha. Confirmado tanto em SQL
direto quanto via API real (`/api/clients`, `/api/collection-orders/...`) com dois usuários logados de
empresas diferentes.

**Atualização**: a migration 006 originalmente fixava `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`, o que só
funcionava no Supabase (onde o papel administrativo se chama `postgres`). Corrigido pela migration
`007_app_runtime_role_portability.sql`, que declara os privilégios padrão sem fixar o nome do papel — agora
funciona igual em qualquer ambiente, incluindo o `compose.yaml` local (onde o papel administrativo é `raiz`).
O `compose.yaml` local ainda cria `raiz` como superusuário (padrão da imagem oficial do Postgres) — isso
continua correto para rodar migrations, mas antes de rodar a aplicação contra esse banco é necessário seguir
os mesmos passos do README (`npm run db:migrate`, `npm run db:set-app-password`, preencher
`APP_DATABASE_URL`) para que a aplicação use o papel restrito `raiz_app`, e não o `raiz` administrativo.

## Auditoria do bloco v0.5 (operações de campo)

Testado de ponta a ponta contra banco real (Supabase), pela API HTTP real, com sessão de login real:

- criação de propriedade e talhão com polígono GeoJSON real; área em hectares calculada pelo PostGIS
  (39,75 ha para o talhão de teste, valor compatível com o polígono enviado);
- criação de safra;
- criação de ordem de coleta com estratégia `GRID`: `ST_SquareGrid` + transformação UTM gerou 25 pontos
  reais dentro do talhão (grid de 2 ha em talhão de ~40 ha) — este era um item explicitamente marcado como
  não testado em `V0.5_INTERRUPTED.md`;
- listagem de ordens com pontos (GeoJSON, sequência, profundidade);
- registro de coleta via GPS simulado no ponto planejado (distância 0 m, aceito);
- bloqueio correto de GPS fora do limite do talhão;
- importação de pontos via CSV com decimal brasileiro (vírgula), 3 pontos aceitos corretamente;
- bloqueio correto de acesso de uma empresa a ordem de coleta de outra empresa (404, RLS).

**Bug corrigido nesta auditoria**: `listCollectionOrders` (`src/lib/repositories/collections.ts`) enviava
`tenantId` como parâmetro da consulta SQL sem nunca referenciá-lo no texto da query — o PostgreSQL rejeitava
a consulta com "could not determine data type of parameter $1". Corrigido adicionando o filtro explícito
`WHERE co.tenant_id = $1::uuid`, que também passa a dar defesa em profundidade (filtro na aplicação, além do
RLS), no mesmo padrão já usado nas demais funções desse arquivo.

**Ainda não testado nesta auditoria** (permanece como pendência do `V0.5_INTERRUPTED.md`): performance da
importação de pontos em volume (a validação e a inserção fazem uma consulta por ponto, em laço), talhões que
cruzam zonas UTM, concorrência/reimportação simultânea, RBAC por todos os perfis (só `TENANT_ADMIN` foi
testado), fluxo GPS em navegador real (só simulado via API).

## Outras notas desta auditoria

- `scripts/seed-dev.mjs` não configurava SSL na conexão — corrigido para respeitar `DATABASE_SSL`, igual aos
  demais scripts (necessário para funcionar contra Supabase).
- `npm audit` aponta 3 vulnerabilidades de severidade alta (Next.js, postcss, sharp); a correção automática
  levaria o Next.js para fora da faixa fixada no `package.json`. Não corrigido nesta auditoria — decisão do
  responsável pelo projeto pendente.

## Barra lateral conectada à sessão real

A `Sidebar` (`src/components/sidebar.tsx`) mostrava nome de empresa e usuário fixos no código
("GrãoSul Agrícola", "Gui Bortoluzzi"), independente de quem estivesse logado — não era um vazamento de
dado entre empresas, apenas texto de exibição nunca conectado à sessão. Corrigido: `src/app/(platform)/layout.tsx`
agora repassa `tenantName`/`userName`/`role` da sessão real para a `Sidebar`, que usa esses valores quando
disponíveis e mantém o texto antigo como aparência do modo demo (`DATA_MODE=demo`, sem sessão). Rótulos de
perfil (`TENANT_ADMIN` → "Administrador" etc.) foram centralizados em `src/lib/role-labels.ts`, reaproveitado
também por `configuracoes/page.tsx`.

## Mapa visual para desenho/importação de polígono (Leaflet)

Item explicitamente listado como incompleto no handoff: o cadastro de propriedade/talhão só aceitava colar
GeoJSON em texto ou subir um arquivo, sem visualização em mapa real. Adicionado `src/components/geo-map-input.tsx`,
um componente de mapa (Leaflet + tiles OpenStreetMap, gratuitos) que permite:

- desenhar o polígono clicando os vértices direto no mapa (sem depender de nenhum serviço pago);
- visualizar o polígono atual (vindo de texto colado, arquivo importado ou desenho) sobre um mapa real;
- ao editar o talhão, mostrar o limite da propriedade selecionada como referência tracejada no mapa.

Integrado nas etapas "Propriedade" e "Talhão" do `field-operations-manager.tsx`, mantendo a caixa de texto e
o upload de arquivo já existentes como alternativas (o mapa é mais uma forma de preencher o mesmo campo, não
substitui as outras). Testado manualmente via Playwright: desenho por clique gera GeoJSON WGS84 válido,
sincronizado corretamente com a caixa de texto.

Decisão técnica: usei apenas `leaflet` (biblioteca principal, sem plugins adicionais como `leaflet-draw`) e
implementei a interação de desenho manualmente, para manter a dependência mínima, gratuita e substituível —
alinhado ao critério do `CLAUDE.md` de preferir a solução mais simples e barata.
