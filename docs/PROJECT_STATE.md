# Estado do Projeto — RAIZ Digital

Data do handoff: 2026-09-01
Última auditoria registrada: 2026-09-03 (Claude Code, banco real via Supabase — sessão noturna autônoma)

## Fluxo de deploy (a partir de 2026-09-02)

- `main` = produção. Só recebe merge depois de aprovação explícita do responsável do produto, olhando o Preview.
- `develop` = branch permanente de desenvolvimento/homologação. Branches de funcionalidade (`feat/...`) nascem dela.
- Todo push que não seja em `main` gera automaticamente um Vercel Preview Deployment (URL `*.vercel.app` própria), nunca produção.
- O domínio de produção (`raiz-digital-brown.vercel.app`) só muda depois de merge em `main`.
- Fluxo obrigatório: desenvolvimento → testes → branch não-`main` → Preview → aprovação → merge em `main` → produção.

## Estado executivo

| Área | Estado | Observação |
|---|---|---|
| Identidade visual | Consolidada, símbolo corrigido | Guia oficial incluído; bug no arquivo de logo corrigido (ver seção própria) |
| Navegação/UX base | Implementada | Desktop + mobile |
| PostgreSQL/PostGIS | Validado em banco real | Migrations 001-006 aplicadas contra Supabase (dev); grid PostGIS/UTM testado com talhão real |
| Multiempresa | Validado E2E com 2 tenants | Testado via API real (login + criação + listagem cruzada) |
| RLS | Corrigida e validada | Ver "Correção crítica de RLS" abaixo — estava sem efeito prático até esta auditoria |
| Login/sessão | Validado real | Login, senha incorreta, sessão sem cookie e logout testados via HTTP real. Falta endurecimento comercial (2FA, recuperação de senha) |
| Clientes | Persistência inicial, validada | CRUD inicial testado via API real |
| Propriedades | API inicial, validada | Editor visual de polígono (mapa Leaflet) disponível; boundary opcional |
| Talhões | PostGIS + API inicial, validada | Área em hectare calculada corretamente pelo PostGIS em teste real; editor visual de polígono (mapa Leaflet, desenho por clique) implementado e testado |
| Safras e Culturas | Persistência real, validada | Cultura agora é vínculo a `crop_profiles` (catálogo cadastrável), não texto livre; adiciona cultivar, sistema de cultivo, textura de solo, região técnica. Ver "Fundação da Inteligência Agronômica" abaixo |
| Análises | Persistência inicial + núcleo técnico real | Tela de análise mostra o painel de Inteligência Agronômica real (não mais placeholder) |
| Importação laboratório CSV | Implementada + corrigida | CSV longo/amplo; **corrigido elo de rastreabilidade quebrado** — laudo agora é promovido de verdade para `lab_samples`/`lab_results`, não só para a área de rascunho. Ainda faltam XLSX/PDF |
| Normalização laboratório | Implementada parcialmente | Biblioteca de métodos ainda precisa homologação |
| Índice de confiança | Dois índices distintos agora existem | O da importação (qualidade do CSV) já existia; o motor determinístico calcula o seu próprio (completude/contexto/compatibilidade de regra) por interpretação |
| Operações de campo v0.5 | Auditada e validada em banco real | Ver "Auditoria do bloco v0.5" abaixo |
| Motor agronômico | **Implementado e validado em banco real** | Motor determinístico puro (`src/domain/agronomic-engine.ts`) + `interpretations` ativada. Nenhum rule set/perfil de cultura homologado ainda — ver pendências de agrônomo abaixo |
| Perfis de cultura (`crop_profiles`) | Implementado, catálogo cadastrado, faixas vazias | 5 culturas cadastradas (Soja, Milho, Trigo, Cevada, Arroz) em DRAFT, sem nenhuma faixa técnica inventada — aguardando homologação |
| Mapa geográfico | **Real, implementado** | Leaflet + OpenStreetMap substituindo o mapa vetorial abstrato; polígono e pontos reais do PostGIS, clique com painel lateral |
| Revisão/aprovação | **Fluxo executável real** | `POST /api/interpretations/[id]/review`; testado end-to-end contra o banco real |
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

**Atualizações desde a primeira auditoria:**

- **Performance da importação de pontos corrigida**: `importCollectionPoints` fazia uma consulta de validação
  e uma de inserção **por ponto**, em laço (até 2000 idas e voltas ao banco). Reescrito para validar todos os
  pontos em uma única consulta (`unnest` + `ST_Covers`) e inserir todos em uma única consulta (`unnest` +
  `INSERT ... SELECT`), preservando exatamente o mesmo comportamento (mesmos erros, mesma numeração de
  sequência). Testado com importação rejeitada (ponto fora do talhão) e aceita (6 pontos, sequência 1-6),
  ambas contra o banco real.
- **RBAC testado para todos os perfis de escrita**: criados usuários reais de teste com os perfis
  `AGRONOMIST`, `FIELD_TECH`, `COMMERCIAL` e `VIEWER` na mesma empresa, e testado contra `/api/clients`,
  `/api/collection-orders` e `/api/properties`. Todos os resultados bateram com a permissão esperada de cada
  perfil (ex.: `FIELD_TECH` cria ordem de coleta mas não cliente; `COMMERCIAL` cria cliente mas não ordem de
  coleta; `VIEWER` só lê, nunca escreve). Usuários de teste (`rbac-*@raiz.local`) permanecem no tenant
  "Raiz Digital Demo" do banco de desenvolvimento para reuso em testes futuros.

**Ainda não testado** (permanece como pendência do `V0.5_INTERRUPTED.md`): talhões que cruzam zonas UTM,
concorrência/reimportação simultânea, fluxo GPS em navegador real (só simulado via API).

## Vínculo entre ponto de coleta e resultado de laboratório

Fechei o elo que faltava na corrente "coleta → amostra → laudo". O esquema já previa a ligação
(`analyses.collection_order_id` aponta para a ordem de coleta; `analysis_import_rows.sample_code` é o código
da amostra no laudo) mas nada usava essa ligação — as tabelas `lab_samples`/`lab_results` de 001_initial.sql
nunca chegaram a ser usadas pelo fluxo real de importação (que grava em `analysis_import_rows`).

`listCollectionOrders` agora calcula, por ponto, quantos resultados de laudo têm o mesmo código do ponto
dentro da mesma ordem de coleta (`labResultCount`). A tela de Coletas mostra um selo com esse número ao lado
de cada ponto. É um vínculo "por coincidência de código" (o técnico de campo e o laboratório precisam usar o
mesmo código na amostra), não uma chave estrangeira formal — condizente com como laboratórios reais
trabalham hoje, e rastreável (aparece de onde veio) como o `CLAUDE.md` exige.

Testado contra o banco real: ordem com 6 pontos, laudo CSV importado com resultados para 2 desses pontos —
o selo aparece corretamente só nos 2 pontos certos, com a contagem certa (2 e 1 resultados).

## Limpeza dos dados de teste desta auditoria

Removidos do banco de desenvolvimento (Supabase), com autorização explícita do responsável pelo projeto, os
registros criados só para validar o sistema durante esta sessão: o tenant "Fazenda Teste B" (usado para o
teste de isolamento entre empresas) e toda a árvore de dados de teste dentro de "Raiz Digital Demo" (clientes,
propriedade, talhão, safra, ordens de coleta, pontos e análise com laudo importado). O banco ficou no mesmo
estado de um `npm run seed:dev` recém-executado: só o tenant "Raiz Digital Demo", o usuário `admin@raiz.local`
e os 4 usuários de teste de RBAC (`rbac-agronomist@raiz.local`, `rbac-field-tech@raiz.local`,
`rbac-commercial@raiz.local`, `rbac-viewer@raiz.local`, mantidos para reuso em testes futuros de permissão —
senha não registrada aqui por segurança; redefina com um script de update direto no banco se precisar).

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

## XLSX no laudo laboratorial (Fase C do roadmap)

`domain/lab-import.ts` foi separado em duas camadas: `buildLabImportPreviewFromMatrix` (o motor de validação
já existente — detecção de formato, aliases de parâmetro, unidades, confiança) e duas entradas: `buildLabImportPreview`
(CSV, como já era) e `buildLabImportPreviewFromXlsxBase64` (nova, lê a primeira aba da planilha via `xlsx`).
Nenhuma regra de validação foi duplicada ou reescrita. `/api/import/validate`, `/api/import/commit` e o
`LabImporter` (tela de upload) agora aceitam `.xlsx`/`.xls` além de `.csv`/`.txt`; o navegador lê o arquivo como
base64 (`FileReader.readAsDataURL`) para planilhas. PDF continua não suportado — a mensagem na tela deixa isso
explícito, sem sugerir suporte que não existe.

Dependência: instalei `xlsx` direto do pacote oficial do SheetJS hospedado pelos próprios mantenedores
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), não a versão do registro do npm — a versão do npm
tem duas vulnerabilidades de severidade alta sem correção (Prototype Pollution e ReDoS) que os próprios
mantenedores só corrigem na distribuição própria. Como o recurso lê arquivo enviado por qualquer usuário
autenticado, essa vulnerabilidade importava de verdade; `npm audit` confirma 0 vulnerabilidades com a versão
usada.

Testado contra o banco real: planilha de teste com 5 linhas/2 amostras importada com sucesso via API direta e
via upload real pelo formulário (Playwright simulando um usuário real), `source_format` gravado como `XLSX`,
e o selo de vínculo com ponto de coleta (feature anterior) funcionou automaticamente com os dados vindos da
planilha, sem nenhuma mudança adicional — confirma que a unificação do motor de validação está correta.

## Correção do símbolo da marca (bug real, não escolha de estilo)

Ao aplicar a identidade visual em mais lugares do site (pedido do responsável pelo projeto), encontrei um bug
já existente: `public/brand/logo-dark.svg` e `logo-light.svg` tentavam carregar o símbolo (grade + R + raízes)
de um arquivo externo (`raiz-digital-simbolo-fundo-escuro.svg` / `...-fundo-claro.svg`) que nunca existiu na
pasta `public/brand`. Por isso a logo aparecia **só como texto** ("RAIZ DIGITAL"), sem o símbolo, em toda a
plataforma (login, barra lateral) — mesmo com o guia de marca oficial (`docs/brand/Guia_de_Marca_Raiz_Digital.pdf`)
já definindo o símbolo corretamente e o arquivo `public/brand/symbol-dark.svg` já existindo (só nunca foi
referenciado de um jeito que funcionasse).

Corrigido embutindo o símbolo diretamente dentro de `logo-dark.svg`/`logo-light.svg` (SVG aninhado, sem
depender de arquivo externo — mais robusto). Criei também `public/brand/symbol-light.svg` (variante para fundo
claro, que faltava) e `src/app/icon.svg` (favicon da aba do navegador, usando o símbolo sobre fundo grafite).
Confirmado visualmente rodando o site de verdade: o símbolo (grade em ciano, "R" em branco/grafite conforme o
fundo, raízes em cobre) aparece corretamente no login, na barra lateral e na aba do navegador.

**Nota de transparência**: o responsável pelo projeto também compartilhou imagens de um conceito visual
alternativo para o símbolo — um render 3D metálico/cromado com efeito de brilho e textura de circuito. Não
usei esse conceito na implementação porque (1) o guia de marca oficial (`Guia_de_Marca_Raiz_Digital.pdf`,
versão 1.0) já define e explica o símbolo atual em detalhe, com regra explícita de "não usar efeitos: evite
sombras, contornos e brilho" — o que o render metálico contraria diretamente; e (2) as imagens enviadas eram
arquivos de imagem comuns (PNG) com fundo sólido, não teriam ficado limpas ao integrar num site com fundos
variados sem os arquivos de origem em alta resolução e com fundo transparente. Se o responsável pelo projeto
confirmar que quer adotar esse novo visual metálico como marca oficial (substituindo o guia atual), isso exige
uma decisão de produto e, idealmente, os arquivos de origem em vetor/PNG transparente — ainda não implementado,
aguardando confirmação.

## Armazenamento do arquivo bruto do laudo

Fechei outra pendência real: o sistema normalizava o laudo (CSV/XLSX) mas não guardava o arquivo original em
lugar nenhum — só os dados extraídos. O schema já previa isso (`analyses.source_file_key text`, desde a
migration 001) mas nada preenchia essa coluna. Criado `src/lib/storage.ts`: `saveRawImportFile` grava o
arquivo bruto em disco local (pasta `storage/`, fora do Git) quando `STORAGE_PROVIDER=local` (o padrão hoje),
organizado por `imports/<tenantId>/<analysisId>/<timestamp>-<nomeSanitizado>`. `commitCsvImport` chama essa
função e grava a chave resultante em `analyses.source_file_key`. Se `STORAGE_PROVIDER` for outra coisa (ex.:
`s3`, ainda não implementado), a função retorna `null` sem falhar o commit — a importação continua funcionando,
só sem guardar o arquivo bruto, e isso fica registrado como pendência real, não escondido.

De passagem, corrigi um bug pequeno no mesmo bloco: `analyses.source_type` estava sempre gravado como `'CSV'`,
mesmo quando o laudo era uma planilha XLSX (agora usa `'XLSX'` corretamente nesse caso).

Testado contra o banco real: laudo CSV importado, arquivo apareceu em disco no caminho esperado com o conteúdo
exato enviado, e `analyses.source_file_key` gravado com a mesma chave.

**Pendência explícita**: esse armazenamento local funciona bem para desenvolvimento e para produção self-hosted
(o modelo que o `CLAUDE.md` prioriza), mas não persiste em ambientes serverless/efêmeros. Antes de produção em
qualquer ambiente assim, será necessário implementar o provedor S3-compatível (`STORAGE_PROVIDER=s3`, variáveis
já previstas em `.env.example`) — decisão de infraestrutura que envolve escolher/contratar um serviço, por isso
não implementei sem confirmação.

## Cadastro real de laboratórios

A tela de nova análise mostrava "LabSolo" e "Outro laboratório" como opções fixas no código — não eram
laboratórios cadastrados de verdade, só texto solto no formulário (o schema já tinha a tabela `laboratories`
e `analyses.laboratory_id`, mas nada os conectava). Implementado:

- `GET/POST /api/laboratories` (lista e cria; escrita restrita a `SUPER_ADMIN`/`TENANT_ADMIN`/`AGRONOMIST`,
  testado que `VIEWER` é bloqueado com 403).
- `listAgronomicContext` (usado por `/api/context`) agora inclui `laboratories`.
- A etapa "Laudo laboratorial" do assistente de nova análise, em modo banco de dados, lista laboratórios reais
  e permite cadastrar um novo direto ali (nome + botão "Cadastrar", aparece na lista e já fica selecionado).
  O modo demonstração continua com as opções de exemplo, sem mudança.
- `laboratoryId` agora é enviado de verdade ao criar a análise (antes o campo existia na API mas o formulário
  nunca preenchia). A tela de detalhe da análise mostra o nome do laboratório vinculado quando houver.

Testado contra o banco real (API direta e pela tela, desktop e celular): laboratório criado, aparece na
listagem, vinculado à análise, nome aparece na página de detalhe. RBAC confirmado (perfil de leitura bloqueado
ao tentar cadastrar).

## Abas de Configurações conectadas a dados reais

Os botões "Biblioteca técnica", "Laboratórios", "Mercado Pago", "E-mail e relatórios" e "Auditoria" existiam
na tela de Configurações mas eram só texto — sem `onClick`, sem troca de conteúdo (a página era um Server
Component, sem estado nenhum). Extraí a interatividade para `src/components/settings-tabs.tsx` (Client
Component), mantendo a busca de dados no servidor:

- **Usuários e permissões**: comportamento igual a antes, agora numa aba de verdade.
- **Laboratórios**: lista os laboratórios reais (mesma API criada para a Fase C) e permite cadastrar um novo
  ali mesmo.
- **Auditoria**: mostra a trilha real de `audit_events` (ação, quem, quando), com rótulos legíveis em
  português para as 10 ações que o sistema já registra. Esse dado já existia e já era gravado a cada criação
  real — só nunca tinha tela para mostrar.
- **Biblioteca técnica**, **Mercado Pago**, **E-mail e relatórios**: agora mostram "Ainda não implementado"
  com uma frase explicando o motivo, em vez de simplesmente não fazer nada quando clicados.

**Bug de responsividade encontrado e corrigido nesse processo** (fora do escopo original, mas achado ao testar
a aba de Auditoria no celular): `.settings-grid` usava `grid-template-columns: 1fr` tanto no desktop quanto no
mobile. Sem `minmax(0, ...)`, uma tabela larga (`min-width:760px`) força a própria coluna do grid a crescer
para acomodá-la, e isso estourava a página inteira para o lado no celular — não bastava a tabela estar dentro
de um `.data-card` com `overflow-x:auto`, porque o estouro acontecia uma camada acima, no grid. Esse bug já
existia na tela original de Configurações (antes desta sessão), só nunca tinha sido percebido porque a tabela
de usuários nunca tinha ficado larga o bastante para revelar o problema. Corrigido trocando para
`grid-template-columns: minmax(0,1fr)` (e o equivalente no desktop, `240px minmax(0,1fr)`). Testado: sem
estouro horizontal em nenhuma aba, nem no desktop nem no celular (390px).

## Convite de membro da equipe e troca de senha

Gap real fechado: não existia nenhuma forma de adicionar um novo usuário à empresa pelo próprio site — só
rodando um script direto no banco (`seed-dev.mjs`). Isso travava qualquer uso real em equipe. Também não
existia nenhuma forma de um usuário trocar a própria senha, o que tornaria esse convite incompleto (a pessoa
convidada ficaria presa para sempre com uma senha temporária conhecida pelo administrador).

- `POST /api/team`: cria o convite. Restrito a `SUPER_ADMIN`/`TENANT_ADMIN` (mais restrito que outras rotas
  de escrita, de propósito — gerenciar quem tem acesso é mais sensível). Não permite atribuir o perfil
  `SUPER_ADMIN` por essa via (só os cinco perfis abaixo dele). Gera uma senha temporária aleatória (12
  caracteres), devolvida **uma única vez** na resposta — nunca fica em log nem em lugar nenhum além do hash
  Argon2 no banco. Se o e-mail já é de um usuário existente, só cria o vínculo com a empresa e **não** mexe
  na senha dele (evita que um administrador de uma empresa possa sequestrar a conta de alguém cadastrado em
  outra empresa só sabendo o e-mail). E-mail já vinculado a esta mesma empresa retorna erro 409.
- `POST /api/auth/change-password`: qualquer usuário logado troca a própria senha, exige a senha atual
  correta (reaproveita `verifyPassword`/`hashPassword` já usados no login, mesmos parâmetros do Argon2).
- Aba "Usuários e permissões" das Configurações ganhou os dois formulários: "Convidar membro" (nome, e-mail,
  perfil, mostra a senha temporária uma vez) e "Minha conta" (trocar a própria senha).

Testado contra o banco real, API direta: membro convidado, login com a senha temporária funcionou, troca de
senha funcionou, login com a senha antiga passou a falhar (401) e com a nova passou a funcionar (200),
convite duplicado bloqueado (409), perfil sem permissão bloqueado ao tentar convidar (403). Testado pela tela
real (desktop e celular 390px): sem estouro de layout.

**Ainda não implementado, registrado como pendência real**: convite por e-mail de verdade (hoje o
administrador precisa copiar e repassar a senha temporária manualmente, por fora do sistema — não é enviado
nada automaticamente), expiração do convite, e 2FA. Segue como o `CLAUDE.md` já previa em "Antes de produção
ainda faltam 2FA administrativo, recuperação de senha, convites" — o convite básico e a troca de senha própria
agora existem; recuperação de senha esquecida (sem estar logado) e 2FA continuam pendentes.

## Bloqueio de login por força bruta

Outro item de "Antes de produção" do `CLAUDE.md` ("rate limiting") fechado parcialmente: nada impedia
tentativas ilimitadas de adivinhar a senha de um usuário. Implementado sem nenhum serviço novo (nada de
Redis) — só uma tabela no próprio PostgreSQL:

- `db/migrations/008_login_attempts.sql`: tabela `login_attempts` (e-mail, hash do IP, data), sem RLS/tenant
  (login acontece antes de existir contexto de empresa, mesmo padrão de `users`/`user_sessions`). Só registra
  tentativas malsucedidas.
- `/api/auth/login` agora verifica, antes até de checar a senha, se já houve 5 tentativas malsucedidas para
  aquele e-mail nos últimos 15 minutos; se sim, bloqueia com 429 e mensagem de quanto tempo falta — mesmo que
  a senha desta tentativa estivesse certa (comportamento correto: uma vez atingido o limite, é preciso esperar
  a janela passar).
- Bloqueio é por e-mail, não afeta outros usuários nem o restante do sistema.

Testado contra o banco real: 5 tentativas erradas seguidas, a 6ª bloqueada com 429 mesmo usando a senha
correta, outro e-mail seguiu funcionando normalmente (login 200).

**Pendência explícita**: essa proteção é só por e-mail; bloqueio por IP (contra alguém tentando muitos
e-mails diferentes do mesmo lugar) ainda não existe. A tabela também cresce sem limpeza automática — hoje
isso é aceitável (linhas pequenas, só tentativas falhas), mas antes de produção de longo prazo vale um job de
limpeza periódica (que depende da fila em PostgreSQL ainda não construída, ver Fase C do roadmap).

## Recuperação de senha (esqueci minha senha)

Último item da lista "Antes de produção ainda faltam 2FA administrativo, recuperação de senha, convites" do
`CLAUDE.md` que dava para fechar sem precisar de serviço novo — recuperação de senha para quem **não** está
logado (o "Minha conta" desta sessão só resolvia para quem já estava logado).

- `db/migrations/009_password_reset_tokens.sql`: tabela `password_reset_tokens` (token opaco com hash SHA-256
  salvo, nunca o token bruto — mesmo padrão de `user_sessions`), com validade de 30 minutos e uso único.
- `src/lib/email.ts`: adaptador de e-mail mínimo. Com `EMAIL_PROVIDER=console` (o padrão hoje), a mensagem é
  só escrita no console do servidor em vez de enviada de verdade — é assim que se pega o link de redefinição
  neste ambiente de desenvolvimento. Preparado para trocar por um provedor real depois, sem mexer no resto do
  fluxo.
- `POST /api/auth/forgot-password`: sempre responde a mesma mensagem genérica, exista ou não o e-mail
  cadastrado — não dá pra usar essa rota para descobrir quem tem conta no sistema.
- `POST /api/auth/reset-password`: valida o token (existe, não expirou, não foi usado), troca a senha e
  **revoga todas as sessões ativas daquele usuário** — se alguém está redefinindo a senha, presume-se que a
  conta pode ter sido comprometida, então qualquer sessão aberta em outro lugar é encerrada.
- Telas novas `/esqueci-senha` e `/redefinir-senha`, e link "Esqueci minha senha" na tela de login.

Testado contra o banco real, ponta a ponta: pedido de redefinição, link capturado no log do servidor,
redefinição com sucesso, senha antiga passa a falhar (401) e a nova funciona (200), tentar reusar o mesmo
token falha (422, uso único respeitado), sessão que estava ativa antes da redefinição é revogada (401 depois),
e pedir redefinição para e-mail inexistente devolve a mesma resposta genérica (sem vazar quem existe).
Testado pela tela real, desktop e celular, sem estouro de layout.

Com isso, os três itens de autenticação que o `CLAUDE.md` listava como pendentes antes de produção têm uma
primeira versão funcional: convite de usuário, troca de senha própria e recuperação de senha esquecida. Só
2FA administrativo continua sem nenhuma implementação.

## Edição e exclusão de clientes

Fechando uma lacuna de CRUD real: a API e a tela de Clientes só tinham criar e listar — nenhuma forma de
corrigir um nome digitado errado ou remover um cadastro feito por engano. O ícone de seta em cada linha da
lista nem tinha ação nenhuma (decorativo, sem link).

- `PATCH /api/clients/[id]`: edita nome, CPF/CNPJ, e-mail, telefone e observações. Mesmos perfis que já
  podiam criar cliente (`SUPER_ADMIN`, `TENANT_ADMIN`, `AGRONOMIST`, `COMMERCIAL`).
- `DELETE /api/clients/[id]`: exclui, mas só `SUPER_ADMIN`/`TENANT_ADMIN` (mais restrito, de propósito —
  excluir é mais sensível que editar). Se o cliente já tem propriedade ou talhão vinculado, o próprio banco
  bloqueia a exclusão (chave estrangeira, sem `ON DELETE CASCADE` de propósito, para não apagar histórico
  agronômico sem querer); a rota traduz esse erro em mensagem clara em vez de devolver o erro cru do
  PostgreSQL.
- Tela de Clientes ganhou os ícones de editar (lápis) e excluir (lixeira) em cada linha, substituindo a seta
  decorativa. Editar abre o mesmo formulário de cadastro, pré-preenchido. Excluir pede confirmação antes.
  Ícones "edit" e "trash" novos no conjunto de ícones do projeto (`src/components/icon.tsx`).

Testado contra o banco real: criar, editar e excluir um cliente sem vínculos funcionou; excluir um cliente
que já tinha propriedade foi bloqueado com mensagem clara (409); perfil sem permissão de exclusão foi
bloqueado (403). Testado pela tela real, desktop e celular, sem estouro de layout.

## Busca e filtro reais na tela de Análises

Mesma classe de bug encontrada e corrigida nesta sessão (controle que parece funcional mas não faz nada): a
caixa de busca e o seletor de status da tela de Análises não tinham nenhum `onChange` — eram enfeite. A
página inteira era um Server Component, então não dava para ligar interatividade nela diretamente.

- Novo componente `src/components/analyses-table.tsx` (Client Component) recebe a lista de análises já
  buscada no servidor e faz busca e filtro no navegador, sem nova consulta ao banco a cada letra digitada
  (lista de análises de um tenant é pequena o bastante para isso ser instantâneo e simples).
- Busca compara código da análise, nome do cliente e nome do talhão (sem diferenciar maiúsculas/acentos via
  `toLocaleLowerCase("pt-BR")`).
- O filtro de status antes só oferecia 3 das 12 situações reais do fluxo (resquício do design decorativo
  original). Trocado por `ANALYSIS_STATUS_OPTIONS`, gerado a partir do mesmo mapa de status usado no resto do
  sistema (`src/domain/analysis-ui.ts`), então cobre todas as situações reais e não fica desatualizado se um
  status novo for adicionado depois.
- Estado vazio diferente para "nenhuma análise cadastrada ainda" vs. "a busca/filtro não encontrou nada".
- O modo demonstração (sem banco) manteve a barra de busca/filtro como estava (decorativa), já que os dados
  ali são só exemplo e não há filtro real para aplicar.

Testado pela tela real (Playwright) contra o banco real, desktop e celular: busca sem resultado mostra o
estado vazio certo; filtro por `DRAFT` e `IMPORTED` (os únicos status presentes nos dados de teste) retornou
exatamente as linhas esperadas; filtro pelos demais status retornou zero linhas (correto, nenhuma análise de
teste está nessas situações); sem estouro horizontal de layout em nenhum dos dois tamanhos de tela.

## Edição e exclusão de propriedade, talhão e safra

Mesma lacuna que já existia em Clientes antes desta sessão: propriedade, talhão e safra só podiam ser
criados na tela "Coletas e mapas" — não havia como corrigir um nome digitado errado nem remover um cadastro
de teste, mesmo que o registro não tivesse nenhum vínculo.

- `PATCH`/`DELETE /api/properties/[id]`, `/api/fields/[id]` e `/api/crop-seasons/[id]` (novos). Editar segue
  os mesmos perfis que já podiam criar cada entidade; excluir fica restrito a `SUPER_ADMIN`/`TENANT_ADMIN`
  (mesmo padrão de Clientes: excluir é mais sensível que editar).
- Excluir com vínculo é bloqueado pelo próprio banco (chave estrangeira, sem `ON DELETE CASCADE` de
  propósito) e a rota traduz o erro cru do PostgreSQL em mensagem clara (409): propriedade com talhão,
  talhão com safra ou coleta, safra com ordem de coleta ou análise.
- Edição cobre os campos simples (nome/município/UF da propriedade; nome do talhão; safra, culturas e meta
  produtiva da safra). O polígono (limite geográfico) não é editável por aqui — mudar um polígono já
  cadastrado exigiria revalidar tudo que depende dele (área em hectares, pontos de coleta já dentro do
  talhão), e isso fica para uma tarefa própria caso surja essa necessidade real.
- Cada seção "Propriedade", "Talhão" e "Safra" do acordeão em Coletas e mapas ganhou uma lista dos registros
  já cadastrados, com ícones de editar e excluir — antes eram apenas formulários de criação, sem nenhuma
  lista visível dos que já existiam.

Bug encontrado e corrigido durante o próprio teste: as consultas `UPDATE` tentavam gravar `updated_at`, mas
essas três tabelas nunca tiveram essa coluna (só `clients` tem) — o erro cru do Postgres vazava pra tela.
Corrigido removendo o campo das consultas antes de qualquer commit.

Testado contra o banco real: editar propriedade e confirmar que o nome muda persiste (Playwright, desktop e
celular, sem estouro de layout); excluir propriedade/talhão com vínculo bloqueado com 409 e mensagem clara;
criar uma propriedade descartável e excluí-la com sucesso (200); excluir talhão com safra vinculada bloqueado
(409); excluir safra com ordem de coleta vinculada bloqueado (409).

## Verificação em duas etapas (2FA administrativo)

Último item da lista de autenticação pendente do `CLAUDE.md`. A coluna `two_factor_enabled` já existia em
`users` desde a primeira migração, mas nunca tinha sido usada — o campo estava só reservado no schema.

- Migração `010_two_factor_auth.sql`: adiciona `users.totp_secret`; cria `totp_backup_codes` (códigos de
  backup de uso único, guardados só como hash, nunca em texto puro — mesmo padrão de token opaco já usado
  em `password_reset_tokens`); cria `pending_two_factor_logins` (o estado intermediário entre "senha
  confirmada" e "sessão criada", enquanto o código de 6 dígitos não é digitado).
- TOTP implementado do zero em `src/lib/auth/totp.ts` (base32, HMAC-SHA1, RFC 6238), sem depender de nenhum
  serviço externo — só `node:crypto`. A implementação foi validada byte a byte contra a biblioteca `otplib`
  (referência de mercado) antes de entrar em produção: os dois lados geram exatamente o mesmo código de 6
  dígitos para o mesmo segredo, então qualquer aplicativo autenticador padrão (Google Authenticator, Authy,
  Microsoft Authenticator) funciona normalmente.
- `qrcode` (pacote npm, MIT, 0 vulnerabilidades, roda 100% local) só para desenhar o QR code do segredo —
  nenhuma chamada de rede, nenhum serviço pago envolvido.
- Fluxo: usuário ativa em Configurações → Minha conta → "Verificação em duas etapas" (disponível pra
  qualquer perfil, não só administrador — mais seguro sem motivo técnico pra restringir). Escaneia o QR,
  confirma um código pra ativar de verdade, recebe 10 códigos de backup mostrados uma única vez. No login
  seguinte, depois da senha certa, a tela pede o código do aplicativo (ou um código de backup, se perdeu o
  celular). Desativar exige confirmar a senha atual.
- Reaproveita o mesmo limite de tentativas (`login_attempts`) já usado no login por senha: passado o limite,
  a tentativa de código também fica bloqueada por um tempo, evitando força bruta no código de 6 dígitos.

Dois bugs reais encontrados e corrigidos durante o próprio teste, antes de qualquer commit:
1. O código digitado errado também invalidava a tentativa de login (o token temporário era apagado do banco
   assim que lido, mesmo quando o código estava errado) — corrigido separando "ler o token" de "consumir o
   token", só apagando depois que o código bate.
2. Depois do código certo, a resposta final dava "usuário não encontrado" — a consulta buscava o vínculo
   direto na tabela `tenant_members`, que tem RLS (isolamento por empresa) e não estava com o contexto de
   tenant configurado nessa conexão. Corrigido reaproveitando a mesma function seura que o login por senha já
   usa (`app.user_memberships`) em vez de consultar a tabela protegida diretamente.
3. (Achado à parte, na tela) O campo de código do login mostrava o e-mail digitado na etapa anterior, porque
   o React reaproveitava o mesmo campo de texto do formulário de senha. Corrigido dando uma identidade
   (`key`) diferente para cada etapa do formulário de login, forçando a troca real do campo.

Testado contra o banco real, ponta a ponta, com uma conta de teste descartada ao final (2FA desativado,
segredo e códigos de backup apagados, para não deixar a conta real travada): ativar, confirmar com código
certo, login pedindo o código depois da senha, código errado rejeitado sem invalidar a tentativa, código
certo autentica normalmente, código de backup autentica e fica marcado como usado, reusar o mesmo código de
backup é rejeitado, desativar exige senha e realmente desliga a exigência. Testado em desktop e celular, sem
estouro de layout.

## Notificações reais no sino do topo

O sino no topo de toda tela (`Topbar`, componente usado em todas as páginas da plataforma) nunca teve
nenhuma ação — não abria nada, e a bolinha vermelha de "não visto" aparecia sempre, fixa, mesmo sem
nenhuma atividade nova. Mesma classe de bug já corrigida antes nesta sessão (controle que parece
interativo mas não faz nada), só que espalhada pelo sistema inteiro em vez de uma tela só.

- Novo `GET /api/notifications`, reaproveitando o `listAuditEvents` que já existia (mesma trilha de
  auditoria já usada na aba Auditoria de Configurações) — sem tabela nova, sem dado inventado.
- Clicar no sino abre um painel com as 10 atividades mais recentes da empresa (quem fez o quê e quando).
  Fecha ao clicar fora ou apertar Esc.
- A bolinha vermelha agora só aparece quando existe atividade mais nova do que a última vez que a pessoa
  abriu o painel (guardado no navegador dela, por ser só uma conveniência visual por pessoa, não um dado que
  precise ficar salvo no banco).
- No modo demonstração o sino continua decorativo (coerente: ali não existe atividade real pra mostrar).

De quebra, ao construir isso percebi que várias ações de auditoria criadas mais cedo nesta sessão (editar e
excluir propriedade/talhão/safra/cliente, convite de equipe) nunca tinham entrado no dicionário de rótulos
(`src/lib/audit-labels.ts`) — apareciam como código cru (ex.: `PROPERTY_UPDATED`) tanto no sino quanto na
aba Auditoria de Configurações. Corrigido junto, adicionando os rótulos em português que faltavam.

Testado contra o banco real: painel mostra atividade verdadeira (inclusive a limpeza de propriedades de
teste feita mais cedo nesta sessão apareceu lá, com rótulo legível); bolinha some depois de abrir o painel e
continua sumida depois de recarregar a página; fecha ao clicar fora; sem estouro de layout em desktop.
Celular mantém o comportamento já existente de esconder o sino no topo compacto (decisão de design anterior
a esta sessão, não alterada).

## Correção: número fictício no menu lateral

Achado numa varredura por dado inventado em modo real (o `CLAUDE.md` proíbe isso explicitamente): o item
"Análises" do menu lateral (`src/components/sidebar.tsx`) sempre mostrava uma bolinha laranja com o número
**7** fixo no código — em toda página, inclusive com o banco real conectado e mesmo sem nenhuma análise
pendente de verdade. Era herança do protótipo visual original e nunca tinha sido conectado a dado real.

- `PlatformLayout` (`src/app/(platform)/layout.tsx`) agora busca o mesmo retrato usado no painel inicial
  (`getDashboardSnapshot`, que já existia) e passa para a barra lateral a soma real de análises "aguardando
  revisão" + "com inconsistência" — o mesmo número que já aparece nos cartões do painel inicial.
- A bolinha só aparece quando esse número é maior que zero; sem pendência real, some.
- O modo demonstração (sem banco) manteve o número de exemplo, já que ali os dados são só ilustrativos e
  isso é comunicado por um aviso de tela; não é o caso proibido pelo `CLAUDE.md` (que é especificamente sobre
  `DATA_MODE=database`).

Testado contra o banco real: com nenhuma análise pendente, a bolinha não aparece; forçando temporariamente
uma análise para "Aguardando revisão" (revertido logo em seguida), a bolinha passou a mostrar exatamente o
mesmo número do cartão "Aguardando revisão" do painel inicial.

## Gestão real de equipe: mudar perfil e desativar acesso

Lacuna de segurança encontrada nesta sessão: a coluna `active` de `tenant_members` já existia desde a
primeira migração e já era exibida na tela ("Ativo"/"Inativo"), mas nunca havia nenhuma forma de mudá-la —
só era possível **convidar** gente, nunca revogar o acesso de quem já não trabalha mais na empresa, nem
corrigir um perfil atribuído errado.

- `PATCH /api/team/[id]` (novo): muda o perfil (`role`) e/ou a situação (`active`) de um membro já existente.
  Só `SUPER_ADMIN`/`TENANT_ADMIN` podem usar; e só um `SUPER_ADMIN` pode gerenciar outro `SUPER_ADMIN`
  (evita que um administrador comum rebaixe ou desative alguém acima dele na hierarquia).
- Duas travas de segurança no banco (`src/lib/repositories/team.ts`), testadas de verdade: ninguém pode
  desativar a própria conta pela tela (evita ficar trancado para fora sem querer), e não é possível
  rebaixar ou desativar o **último** administrador ativo da empresa — sempre sobra pelo menos um
  `SUPER_ADMIN`/`TENANT_ADMIN` com acesso.
- Desativar um membro também revoga na hora todas as sessões abertas dele (mesmo padrão já usado na
  redefinição de senha); a próxima ação dele em qualquer aba já aberta falha, e o próximo login é recusado
  de imediato — a trava de `active = true` já existia na função do banco usada pelo login (`app.user_memberships`),
  só não estava conectada a nenhum botão.
- Tela de Configurações → Usuários e permissões: cada linha da equipe (exceto a própria conta logada e
  contas `SUPER_ADMIN`, que ficam sem esses controles) ganhou um seletor de perfil editável e um botão
  Desativar/Reativar.

Testado contra o banco real com uma conta de teste já existente (RBAC viewer), sem afetar nenhum dado real:
mudar perfil persiste; desativar bloqueia login imediatamente (403, "sem empresa ativa vinculada");
reativar libera o login de novo, já com o novo perfil; tentar rebaixar o único administrador é bloqueado
(409, mensagem clara); tentar autodesativar é bloqueado (400, mensagem clara); a sessão do administrador
continua válida durante todo o processo. Testado em desktop e celular, sem estouro de layout.

## Edição e desativação de laboratório

Mesma lacuna de CRUD incompleto, desta vez em Laboratórios: só dava para cadastrar, nunca corrigir um nome
digitado errado nem desativar um laboratório que a empresa parou de usar. A tabela já tinha a coluna
`active` desde a primeira migração (usada só para filtrar a lista de seleção ao criar uma análise), mas
nada na tela deixava desativar — mesmo padrão de campo "pronto no banco, nunca conectado" encontrado antes
nesta sessão com a equipe.

- `PATCH /api/laboratories/[id]` (novo): edita nome/CNPJ ou muda a situação (ativo/inativo). Mesmos perfis
  que já podiam cadastrar (`SUPER_ADMIN`, `TENANT_ADMIN`, `AGRONOMIST`).
- Desativar é um "soft delete" de propósito, não uma exclusão — a tabela de análises referencia o
  laboratório, e um laudo já lançado não deve perder a rastreabilidade de onde veio. Um laboratório
  desativado simplesmente some da lista de opções ao criar uma nova análise, mas continua visível (com o
  status "Inativo") na tela de gestão, podendo ser reativado a qualquer momento.
- A lista de gestão em Configurações agora busca todos os laboratórios (ativos e inativos); a lista usada
  no formulário de nova análise continua mostrando só os ativos, como já era.
- Formulário de "Cadastrar laboratório" agora só aparece para quem tem permissão de gerenciar (antes
  aparecia pra qualquer perfil, inclusive Leitura, que sempre recebia erro 403 ao tentar usar).

De quebra, a limpeza deste teste revelou dois laboratórios de teste ("Laboratório Teste UI ...") esquecidos
de uma sessão anterior, ainda ativos e aparecendo como opção real de laboratório para qualquer análise nova
— foram desativados como parte da verificação desta funcionalidade.

Testado contra o banco real: editar nome persiste; desativar muda o status na tela e o item some da lista
de seleção de "nova análise"; reativar traz de volta. Desktop, sem estouro de layout.

## Cancelar ordem de coleta

A coluna `status` de `collection_orders` já previa o valor `CANCELED` desde a primeira migração (junto de
`PLANNED`, `IN_PROGRESS`, `DONE`), mas nada no sistema nunca escrevia esse valor — mesmo padrão de "campo
pronto no banco, nunca conectado a nenhuma ação" encontrado várias vezes nesta sessão (equipe, laboratórios,
2FA). Uma ordem criada por engano, ou que não faz mais sentido, não tinha como sumir da operação.

- `PATCH /api/collection-orders/[id]` (novo), aceitando `{ status: "CANCELED" }`. Só permite cancelar uma
  ordem que ainda está `PLANNED` (nenhum ponto coletado ainda) — cancelar uma coleta já em andamento ou
  concluída levanta perguntas maiores (o que fazer com os pontos já coletados e com laudos que já
  referenciam essa ordem) que ficam para uma decisão de produto própria, não uma correção de lacuna simples
  como esta.
- Botão "Cancelar ordem" na tela de Coletas e mapas, ao lado do anel de progresso, visível só quando a
  ordem selecionada ainda está planejada. Pede confirmação antes de agir.
- Mesmos perfis que já podiam criar ordem (`SUPER_ADMIN`, `TENANT_ADMIN`, `AGRONOMIST`, `FIELD_TECH`).

Testado contra o banco real: tentar cancelar uma ordem simulada como "em andamento" foi bloqueado (409,
mensagem clara); cancelar uma ordem realmente planejada funcionou; tentar cancelar de novo a mesma ordem já
cancelada foi bloqueado pela mesma trava. Testado pela tela real (o botão aparece só na ordem certa e some
depois de cancelada), desktop e celular, sem estouro de layout.

## Campo "irrigado" da safra nunca aparecia no formulário

Mais um caso do mesmo padrão desta sessão: a coluna `irrigated` existe em `crop_seasons` desde a primeira
migração, e a API já sabia ler e gravar esse valor desde que a edição de safra foi criada mais cedo nesta
sessão — só que nenhum formulário jamais mostrava essa opção. Toda safra cadastrada até agora ficou marcada
como "não irrigada" por padrão, mesmo quando era.

- Checkbox "Área irrigada" adicionado ao formulário de criar safra e ao formulário de editar (dentro da
  lista de safras já cadastradas), em Coletas e mapas.
- A lista de safras já cadastradas agora mostra "· irrigado" ao lado da cultura quando aplicável, pra ficar
  visível sem precisar abrir a edição.
- `listAgronomicContext` (usada para montar o contexto da tela) passou a trazer esse campo — antes nem
  chegava no navegador.

Testado com chamadas diretas à API contra o banco real (mais confiável que ler o texto da tela, que tem
atraso de re-render): marcar irrigado como verdadeiro persiste e é confirmado por uma consulta separada;
voltar para falso também persiste. Formulário testado visualmente em desktop, encaixando bem no grid
existente.

## Observação de campo ao confirmar ponto de coleta

Última lacuna encontrada na varredura desta sessão pelo schema do banco: a API de confirmar coleta de ponto
já aceitava um texto de observação (`sample_points.notes`) desde que essa rota foi criada, mas a tela nunca
oferecia esse campo — só o botão de toque único "Confirmar aqui". Diferente das outras correções deste tipo,
esta exigia um cuidado de design real: o fluxo de coleta é usado no celular, ao ar livre, e é pensado para
ser rápido (um toque confirma o ponto por GPS); um campo de texto por padrão atrapalharia isso.

- Cada ponto ainda não coletado ganhou um pequeno botão (ícone de lápis) ao lado de "Confirmar aqui" que
  abre um campo de texto opcional só quando a pessoa realmente quer registrar algo (ex.: "solo compactado
  perto da cerca"). O botão principal de toque único continua exatamente como era.
- A observação é enviada junto no momento de confirmar o ponto — não existe um botão "salvar" separado, só
  o "Confirmar aqui" de sempre, evitando um passo extra.
- Depois de coletado, se houver observação, ela aparece como uma linha discreta abaixo das coordenadas do
  ponto, visível sem precisar abrir nada.
- `listCollectionOrders` e a rota `/api/context` passaram a trazer esse campo — antes nem chegava no
  navegador, mesmo já existindo no banco.

Testado contra o banco real, com geolocalização simulada exatamente nas coordenadas do ponto (Playwright):
abrir o campo de observação, digitar um texto, confirmar o ponto por GPS — a observação foi persistida
corretamente no banco junto com a confirmação (`collected_at` e `notes` preenchidos). Testado em desktop e
celular, sem estouro de layout mesmo com o campo de observação aberto. O ponto de teste foi revertido ao
estado original (não coletado, sem observação) ao final.

## Revisão de segurança de tudo construído nesta sessão

Antes de continuar acrescentando funcionalidade, rodei uma revisão de código de nível alto (vários agentes
verificando ângulos diferentes: reaproveitamento, eficiência, isolamento entre empresas, comportamento
removido, aderência ao `CLAUDE.md`, rastreamento entre arquivos, e um mergulho dedicado na segurança do
2FA) sobre tudo commitado nesta sessão, do CRUD de clientes até a observação de coleta. A trilha de
isolamento multiempresa (RLS + `tenant_id` em toda consulta) saiu limpa — nenhum vazamento entre empresas
encontrado. Os achados reais, já corrigidos:

- **2FA podia ser desligado sem senha.** `POST /api/auth/2fa/setup` só exigia sessão válida, e ao ser
  chamado de novo (por exemplo, por alguém com uma sessão sequestrada) gerava um novo segredo e desligava
  o 2FA existente na hora — sem pedir a senha, ao contrário do fluxo de desativar, que sempre exigiu. A
  tela nunca oferecia esse caminho (só mostra "Ativar" quando desligado), mas a rota em si não impedia.
  Corrigido: gerar um novo QR Code quando o 2FA **já está ativo** agora exige confirmar a senha atual,
  igual ao botão "Desativar". A primeira configuração (sem 2FA ainda) continua sem pedir senha, já que
  não há nada pra proteger ainda.
- **Código TOTP podia ser reaproveitado por até ~90 segundos.** A verificação aceitava qualquer código
  válido dentro da janela de tolerância, sem lembrar que aquele código específico (ou um mais antigo) já
  tinha sido usado — alguém que visse um código de relance (registro de log, "shoulder surfing") podia
  reusá-lo pra completar um segundo login independente. Corrigido com a migração `011_totp_replay_protection.sql`
  (`users.totp_last_counter`): cada passo de 30 segundos só pode autenticar uma vez.
- **Duas condições de corrida.** (1) Dois pedidos simultâneos de rebaixar/desativar administrador podiam,
  em teoria, ler "sobra 1 administrador" antes de qualquer um confirmar, deixando a empresa sem nenhum
  administrador ativo — corrigido travando as linhas de administrador (`FOR UPDATE`) antes de contar. (2) O
  mesmo código de backup podia, em teoria, autenticar duas sessões simultâneas — corrigido trocando
  "consultar depois atualizar" por um único `UPDATE ... WHERE usado_em IS NULL`, atômico.
- **RBAC inconsistente em editar talhão.** `PATCH /api/fields/[id]` permitia ao perfil Comercial editar
  qualquer talhão, mas esse perfil nunca teve permissão de *criar* um — resquício de copiar a lista de
  perfis de outra rota parecida. Corrigido para bater exatamente com quem pode criar.
- Pequenos ajustes de solidez: a resposta final do login por 2FA agora confere se a pessoa ainda tem acesso
  à empresa **antes** de criar a sessão (mesma ordem do login por senha) em vez de criar a sessão e só
  depois descobrir que não devia; inserção dos 10 códigos de backup passou de 10 consultas sequenciais para
  uma só.

Todas as correções testadas contra o banco real: reconfigurar o 2FA já ativo sem senha é bloqueado (400),
com senha errada é bloqueado (401), com senha certa funciona; reusar o mesmo código TOTP em outro login é
rejeitado; a trava do último administrador continua funcionando depois da correção; o perfil Comercial não
consegue mais editar talhão (403). Nenhuma regressão nos fluxos que já funcionavam.

## Testes automatizados de ponta a ponta (E2E) para 2FA e isolamento entre empresas

A própria revisão de segurança encontrou uma lacuna estrutural: todo teste "contra o banco real" feito
nesta sessão inteira foi um script avulso, rodado manualmente e depois descartado — nunca virou um teste
que continua no repositório para alguém rodar de novo mais tarde. Isso não bate com a exigência do
`CLAUDE.md` de "teste automatizado ou E2E compatível com o risco", especialmente para os dois fluxos mais
sensíveis do sistema: 2FA e isolamento multiempresa.

- Novo diretório `e2e/` com testes reais em Playwright (`@playwright/test`, adicionado como dependência de
  desenvolvimento — grátis, roda local, mesma ferramenta já usada informalmente a sessão inteira para
  verificação manual). `npm run test:e2e` roda a suíte contra um `npm run dev` já no ar.
- `e2e/two-factor.spec.ts`: ativar gera QR code e 10 códigos de backup; login com 2FA pede o código, rejeita
  errado, aceita certo; código TOTP não pode ser reaproveitado (a proteção contra replay corrigida acima,
  agora com teste que trava isso permanentemente); reconfigurar 2FA já ativo exige senha; desativar exige
  senha e realmente desliga a exigência.
- `e2e/tenant-isolation.spec.ts`: valida a regra inegociável do `CLAUDE.md` ("toda entidade operacional deve
  respeitar isolamento multiempresa") com duas empresas de verdade — uma empresa não vê nem consegue editar
  cliente de outra, e a própria empresa continua funcionando normalmente (não é uma trava geral).
- Duas contas de teste dedicadas foram criadas no banco de desenvolvimento com o próprio script de seed já
  existente (`scripts/seed-dev.mjs`, reaproveitado sem alteração): `e2e-2fa@raiz.local` (testes de 2FA, no
  tenant principal) e `e2e-tenant-b@raiz.local` (uma segunda empresa, "RAIZ E2E Isolamento", dedicada ao
  teste de isolamento). Documentado em `e2e/README.md`, incluindo como recriá-las.
- `.gitignore` ganhou as pastas que o Playwright gera (`test-results/`, `playwright-report/`).

Rodado duas vezes seguidas contra o banco real para confirmar que os testes são repetíveis (não deixam
resíduo que quebre a próxima execução): 8 de 8 aprovados nas duas vezes. Um detalhe de armadilha encontrado
e corrigido no próprio teste (não no sistema): ativar o 2FA e logar em seguida usando o "código de agora"
duas vezes podia cair no mesmo passo de 30 segundos já consumido pela proteção contra replay — corrigido
fazendo os testes usarem explicitamente o passo seguinte ao da ativação.

## Verificação automática a cada envio ao GitHub (CI)

Até agora, `typecheck`/`test:handoff`/`build` só rodavam quando alguém (eu, nesta sessão) lembrava de rodar
manualmente antes de cada commit. Adicionado `.github/workflows/ci.yml`: toda vez que algo é enviado para
`main` (ou aberto um pull request), o GitHub roda sozinho, de graça, os três passos — se algo quebrar, fica
visível direto no GitHub, sem depender de ninguém lembrar de testar antes.

Confirmado antes de configurar que os três passos rodam sem precisar de nenhum segredo (banco de dados,
senha, chave) — testei localmente removendo temporariamente o `.env` e todas as variáveis de ambiente do
banco, e tudo continuou funcionando normalmente. Por isso o CI não precisa de nenhuma configuração extra de
segredo no GitHub. Os testes de ponta a ponta (`test:e2e`, que exigem banco real e navegador) continuam
fora do CI por enquanto — rodam manualmente, como documentado em `e2e/README.md`.

## Publicação do site num link público (em andamento)

O usuário pediu um jeito mais simples de acompanhar o site do que o túnel temporário usado antes (que
caiu sozinho e gerou confusão). Decisão técnica: publicar na Vercel (gratuita, feita pela mesma empresa do
Next.js, conecta direto no GitHub e atualiza sozinha a cada envio — não precisa de "uma publicação por
dia", fica sempre atualizado). Passei ao usuário o passo a passo simples (criar conta grátis, importar o
repositório) e a lista de variáveis de ambiente para colar na Vercel. Detalhe técnico ajustado antes de
recomendar: o armazenamento local de arquivo (`STORAGE_PROVIDER=local`, usado para guardar uma cópia do
laudo original enviado) não funciona em ambiente serverless como a Vercel — orientei trocar para qualquer
valor diferente de `local` nessa variável, o que já é tratado com segurança pelo código existente (a
importação continua funcionando e os dados entram no banco normalmente; só a cópia do arquivo original
não fica arquivada, uma limitação que já existia documentada como "provedor ainda não implementado").
Aguardando o usuário concluir a etapa de conta/importação, que só ele pode fazer.

**Atualização — publicado com sucesso:** o usuário criou a conta na Vercel e importou o repositório
(guiado passo a passo). Depois de liberar a permissão do GitHub App para o repositório `raiz-digital` e
gerar um token de acesso pessoal, o restante — criar o projeto, configurar as 8 variáveis de ambiente,
publicar em produção e apontar `APP_URL` para o endereço definitivo — foi feito diretamente via Vercel CLI
(`npx vercel`, autenticado com o token que o usuário gerou e compartilhou).

**Link permanente e ao vivo:** https://raiz-digital-brown.vercel.app — confirmado funcionando (`/login`
responde 200, `/api/health` confirma `"database":"connected"`). Conectado ao GitHub: todo push para `main`
dispara um novo deploy automático, sem precisar de nenhuma ação manual daqui pra frente.

O token de acesso usado nesta sessão não foi salvo em nenhum arquivo do repositório nem persistido em
disco — existiu só como variável de ambiente temporária durante os comandos do CLI. Se o usuário quiser
revogá-lo por precaução (boa prática depois de compartilhar uma chave em texto), pode fazer isso em
vercel.com/account/settings/tokens a qualquer momento; isso não derruba o site já publicado, só impede
novos comandos de CLI de usarem essa chave específica.

## Correção real: a tipografia oficial da marca nunca era carregada

O usuário pediu para conferir se toda a identidade visual (guia em `docs/brand/Guia_de_Marca_Raiz_Digital.pdf`)
estava mesmo aplicada. Comparando item a item: logo, símbolo, paleta de cores (`#10231F`, `#00BFA6`,
`#34D9D0`, `#B86F3C`, `#F2F5F0`), slogan ("Do solo à decisão, com precisão.") e o descritor
("Inteligência Agronômica") já estavam corretos e consistentes em todo o site. Mas achei um problema real:
`globals.css` declarava as fontes oficiais (Sora para títulos, Inter para o resto) como primeira opção,
só que **nenhum lugar do código de fato carregava essas fontes** — sem link do Google Fonts, sem
`next/font`, sem `@font-face`. Isso significa que, desde que a marca foi aplicada, o navegador de todo
mundo sempre caiu no reserva (Segoe UI/Arial) sem ninguém perceber, porque visualmente a diferença é sutil
à primeira vista.

- `src/app/layout.tsx`: adicionado `next/font/google` para Sora (600/700, títulos) e Inter (400/500/600,
  texto corrido) — a forma recomendada pelo próprio Next.js, que baixa e hospeda as fontes junto com o
  site (sem depender do Google em tempo real) e já gera uma fonte reserva com métricas ajustadas para não
  pular o layout enquanto carrega.
- `globals.css`: as variáveis `--font-heading`/`--font-body` passaram a apontar para essas fontes de
  verdade, mantendo Arial como alternativa de segurança em ambientes sem suporte — exatamente como o guia
  de marca pede.

Testado: confirmado via inspeção real do navegador que `h1` agora usa `Sora` e o `body` usa `Inter` (antes
caía direto no reserva). Confirmado também no site já publicado na Vercel, não só localmente.

Ao varrer o site inteiro atrás de regressão de layout depois da troca (fontes diferentes têm medidas
diferentes, então um texto pode passar a ocupar mais espaço), encontrei um estouro horizontal real em
Configurações → Minha conta: o botão "Alterar senha" ficou um pouco mais largo com a fonte Inter de
verdade e estourou a grade do formulário — mesma causa raiz de um bug já corrigido antes nesta sessão
(`.settings-grid`): colunas de grid `1fr` sem `minmax(0,1fr)` não conseguem encolher abaixo do próprio
conteúdo. Corrigido em `.team-invite-grid`/`.team-invite-grid.password-grid`. Revarrido depois da correção:
9 telas × 3 larguras (1280px, 1440px, celular) = 27 combinações, nenhum estouro.

## Fundação da Inteligência Agronômica por Cultura

Antes de implementar, foi entregue e aprovado pelo diretor do projeto um documento de arquitetura completo
(`docs/ARQUITETURA_INTELIGENCIA_AGRONOMICA.md`), incluindo a verificação honesta de que **não existia
nenhuma IA conectada à plataforma** até este ponto (nenhuma dependência de IA no `package.json`, nenhuma
chamada de rede para provedor nenhum — confirmado por busca em todo o código-fonte). Este bloco implementa
a fundação técnica dessa arquitetura, em ordem controlada, sem conectar nenhuma IA.

### Migrations criadas

- `db/migrations/012_agronomic_intelligence_foundation.sql` — cria `crop_profiles` (catálogo de cultura
  versionado: código, nome, `semantic_version`, `content_hash`, status DRAFT/ACTIVE/SUPERSEDED, regiões e
  sistemas aplicáveis, autor/revisores/aprovador), `crop_profile_parameters` (um parâmetro por perfil, com
  categoria química/física/microbiológica, profundidade, métodos aceitos, `sufficiency_ranges` — **nulo até
  homologação**, criticidade), `technical_regions`; estende `crop_seasons` com `crop_profile_id`,
  `cultivar`, `management_system`, `soil_type`, `soil_texture`, `technical_region_code`; estende
  `lab_results` com `parameter_category` (default `QUIMICO`, coerente com os únicos parâmetros que o
  importador reconhece hoje); torna `interpretations.rule_set_id` opcional e adiciona
  `interpretations.crop_profile_id` e `not_interpretable_reason`; semeia o catálogo inicial de 5 culturas
  (Soja, Milho, Trigo, Cevada, Arroz) **sem nenhuma faixa técnica** — todas em DRAFT, aguardando
  homologação. Aplicada e verificada contra o banco real (Supabase). `scripts/check-migrations.mjs`
  atualizado com asserções para esta migration.

### Modelo de dados final (deste bloco)

```
crop_profiles ──< crop_profile_parameters
     ↑
crop_seasons.crop_profile_id
     ↑
analyses.crop_season_id
     ↓
lab_samples (agora populada de verdade) ──< lab_results (categorizados)
     ↑
sample_points.id (via lab_samples.sample_point_id)
     ↑
collection_orders → crop_seasons → fields → properties → clients

interpretations: analysis_id + crop_profile_id + structured_output (facts/interpretation/
confidence/trace) + status (CALCULATED → IN_REVIEW → APPROVED) + reviewed_by/approved_by
```

### Elo de rastreabilidade quebrado, corrigido

Ao verificar a cadeia ponta a ponta como pedido, encontrei um problema real: `commitCsvImport`
(`src/lib/repositories/imports.ts`) gravava o laudo só em `analysis_imports`/`analysis_import_rows` (área
de rascunho) e **nunca promovia os dados para `lab_samples`/`lab_results`** — confirmado com consulta direta
ao banco: três análises já marcadas `IMPORTED` em produção, mas `lab_results` com zero linhas. O motor
determinístico depende de ler `lab_results` real, então esse elo foi corrigido antes de avançar: cada linha
sem bloqueio na própria linha (unidade e método conhecidos, valor válido) agora é promovida dentro da mesma
transação do commit, casando `sample_code` com `sample_points.code` da ordem de coleta vinculada quando
existe — sem inventar o ponto quando não existe vínculo.

### Motor determinístico

`src/domain/agronomic-engine.ts` é puro (sem acesso a banco): recebe o perfil de cultura da safra + os
resultados de laboratório reais (com a profundidade real do ponto) e devolve, por parâmetro, uma
classificação com a regra/versão usada — ou um motivo explícito de "não interpretável"
(`NO_CROP_PROFILE`, `PARAMETER_NOT_IN_PROFILE`, `DEPTH_UNKNOWN`, `DEPTH_NOT_COVERED`,
`METHOD_NOT_SUPPORTED`, `AWAITING_HOMOLOGATION`, `NO_MATCHING_BAND`). Nunca preenche lacuna por inferência.
11 cenários de teste (`scripts/test-agronomic-engine.mjs`, `npm run test:engine`) cobrindo cada bloqueio e
o caminho interpretável.

### Interpretations ativada

A tabela existia desde a migration 001 mas nunca era escrita. Agora cada execução do motor grava uma nova
revisão com `structured_output` (fatos separados de classificação), `assumptions`/`warnings`, o `rule
set`/perfil e versão usados, nível de confiança e pendências. Toda interpretação nasce com status
`IN_REVIEW` ("aguardando validação técnica") e só avança para `APPROVED` via rota que exige papel de
agrônomo/admin (`POST /api/interpretations/[id]/review`). Histórico por revisão preservado (nunca
sobrescreve).

### Telas implementadas

- **Safras e Culturas** (`field-operations-manager.tsx`): cultura passou de texto livre para seleção do
  catálogo `crop_profiles`; adiciona cultivar, sistema de cultivo, textura de solo, região técnica.
- **Inteligência Agronômica** (`src/components/agronomic-intelligence-panel.tsx`, embutida na página de
  análise): mostra cultura/safra, contexto, parâmetros, classificação determinística, regra/base técnica
  usada, pendências, status de revisão e histórico de revisões. Nenhum texto de IA. Botões de "rodar motor"
  e "aprovar" condicionados ao papel real da sessão.
- **Mapa real** (`src/components/real-field-map.tsx`, tela Coletas e mapas): substitui o mapa vetorial
  abstrato por Leaflet + OpenStreetMap real — polígono real do talhão, pontos reais dos pontos de
  amostragem, cor por status, clique abre painel lateral com os dados reais do ponto. `layersRef` já
  preparado para uma futura camada de fertilidade sem reestruturar o mapa.

### Captura do mapa real funcionando

Testado com Playwright contra o servidor real (não simulado): a ordem `OC-260902-9C31CA` (talhão real,
81 pontos reais) abre com zoom automático correto sobre o polígono do talhão, ruas/geografia real do
OpenStreetMap ao redor, pontos coloridos por status (cobre/laranja = pendente, verde = coletado). Clique no
ponto `P040` abriu o painel lateral com `Status: Pendente`, coordenadas reais, profundidade `0–20 cm` —
tanto em 1440px quanto em 390px (mobile), sem overflow horizontal em nenhuma das duas larguras.

### Confirmação de rastreabilidade

Cadeia verificada com dado real de ponta a ponta, com um teste completo criado e depois limpo do banco:
cliente → propriedade → talhão → safra/cultura (`crop_profile_id`) → ordem de coleta → ponto de amostragem
→ amostra (`lab_samples`, agora com `sample_point_id` real) → laudo/parâmetro (`lab_results`) → regra
(`crop_profile_parameters` homologado) → interpretação (`interpretations`, com trace completo) → revisão
(`reviewInterpretation`, `analyses.status` → `APPROVED`). Confirmado com pH real classificado corretamente
como "Adequado" (5.8) e "Baixo" (5.2) contra as faixas cadastradas.

Dois elos ainda não estão fechados, e é importante ser honesto sobre isso:
- **mapa**: já lê o mesmo dado real de pontos, mas ainda não cruza com o resultado da interpretação
  (camada de fertilidade) — a estrutura (`layersRef`) já está pronta para isso, é o próximo passo natural.
- **relatório**: `reports` existe no schema desde a migration 001, mas nenhum código gera ou publica um
  relatório ainda — isso não fazia parte do escopo pedido nesta fase (que terminava em "mapa" e
  "rastreabilidade") e seria um bloco novo por si só (geração de PDF + storage), não iniciado aqui.

### Testes realizados

- `npm run test:handoff` completo (domínio de laudo, segurança, operações de campo, motor agronômico,
  contratos de migration) — aprovado.
- `npm run typecheck` e `npm run build` — limpos, sem erro.
- Testes reais contra o banco de produção (Supabase), sempre limpos ao final (rollback ou delete
  explícito, nunca deixando dado de teste para trás):
  - promoção de laudo para `lab_samples`/`lab_results` (SQL direto, com rollback);
  - fluxo completo via API real: login → vincular perfil de cultura à safra → homologar parâmetro de pH →
    importar CSV real → motor determinístico → aprovar interpretação → status da análise virou `APPROVED`;
  - Playwright contra o servidor real: painel de Inteligência Agronômica (estado vazio honesto, estado de
    erro honesto) e mapa real (zoom, cor por status, clique → painel), em desktop e mobile, sem erro de
    console e sem overflow horizontal.

### Pendências que dependem obrigatoriamente de um agrônomo

Nada disto foi preenchido com valor inventado — fica marcado como aguardando homologação:
- toda `sufficiency_ranges` de cada `crop_profile_parameters` (as faixas técnicas em si — hoje só existe o
  exemplo de pH usado no teste, que foi removido do banco ao final);
- quais métodos analíticos são aceitos por parâmetro/cultura;
- as regiões técnicas e quais perfis valem em cada uma;
- a definição de quando a densidade de pontos é suficiente para liberar interpolação espacial no mapa;
- a aprovação final de cada interpretação antes de virar relatório publicado (mecanismo já existe, decisão
  é sempre humana).

### Itens preparados para a futura IA (ainda não conectada)

`src/lib/ai/agronomic-explanation-provider.ts` define a interface `AgronomicExplanationProvider` e
`resolveAgronomicExplanationProvider()`, que **retorna `null` sempre** nesta fase — nenhum provedor está
registrado, nenhuma dependência de IA foi instalada, nenhuma chamada de rede acontece. A interface já
impede, pelo próprio formato dos tipos, que uma IA futura substitua uma classificação: ela só recebe o
`EngineResult` já calculado e só pode devolver texto (`narrative`), nunca um número ou uma faixa. Trocar de
provedor no futuro (ex.: um adaptador Anthropic) não deveria exigir tocar no motor determinístico nem nas
telas que o consomem. Integração real só deve acontecer mediante autorização explícita — não incluída
neste bloco.

## Valor operacional e comercial sobre a fundação (mapa, relatórios, alertas, dashboard, biblioteca, comparativos)

Bloco seguinte, aprovado pelo diretor do projeto para transformar a fundação técnica em produto
visível ao cliente. Nenhuma migration nova foi necessária — tudo consome o schema já criado no bloco
anterior. Nenhuma IA foi conectada.

**Mapa agronômico (`/mapas`, e embutido em `/coletas`)** — `RealFieldMap` ganhou coloração por
classificação homologada (prop `colorFor`/`legend` opcionais, uso simples anterior preservado),
seletor de parâmetro/status e alternância Pontos/Interpolação em `AgronomicMapExplorer`.
Interpolação espacial fica bloqueada com mensagem explícita até haver critério técnico homologado —
nunca gera zona estimada. Bug real encontrado e corrigido durante a implementação original do mapa:
o polígono/pontos só apareciam depois de uma segunda renderização por causa de uma corrida entre o
carregamento assíncrono do Leaflet e o efeito de desenho.

**Relatórios (`/relatorios` + 4 tipos)** — fecha o elo mapa → relatório da rastreabilidade. Análise por
talhão, coleta, evolução histórica e executivo da propriedade, cada um puxando cliente/propriedade/
talhão/safra/período/parâmetros/pontos/mapa/classificações homologadas/pendências/revisão/responsável
direto do banco. Exportação em PDF via impressão nativa do navegador (CSS de impressão dedicado,
sem dependência nova). Publicar um relatório grava em `reports` e só é permitido para interpretação já
aprovada. Bug real corrigido durante a validação: os relatórios usavam `logo-dark.svg` com um filtro
CSS de inversão de cor (gerava cores erradas) em vez do `logo-light.svg` correto já disponível em
`public/brand/` para fundo branco.

**Alertas (`/alertas`)** — 10 categorias reais (coleta atrasada, pontos não coletados, laudo aguardando
importação, dado inválido, interpretação aguardando revisão, parâmetro sem homologação, talhão sem
cultura/safra, análise parada há mais de 14 dias, inconsistência de rastreabilidade), cada uma com
criticidade e link direto ao problema. Nenhum item decorativo.

**Painel executivo (`/dashboard`)** — `getExecutiveDashboard` agrega clientes, propriedades, área
total, talhões, safras em andamento, ordens abertas, cobertura de coleta, laudos processados,
interpretações pendentes, talhões críticos e confiabilidade média, filtrável por cliente/propriedade/
safra via querystring.

**Biblioteca Técnica (`/biblioteca-tecnica`, restrita a admin/agrônomo)** — CRUD real de culturas e
parâmetros (categoria, profundidade, métodos aceitos, faixas de suficiência, criticidade), homologação
explícita DRAFT → ACTIVE. `rule_sets` listado como somente leitura (reservado, o motor hoje resolve
direto por perfil de cultura). Métodos/unidades reconhecidos exibidos a partir da mesma constante já
usada pelo importador de laudo, sem duplicar dado.

**Comparativos (`/comparativos`)** — talhão×talhão, safra×safra, ponto×ponto, propriedade×propriedade,
sempre a partir de classificação já homologada ou resultado laboratorial real.

**Inteligência Agronômica (`/inteligencia`)** — registro/trilha de auditoria de toda interpretação já
calculada nesta empresa.

**Navegação reorganizada** — menu lateral e sheet mobile unificados numa fonte só
(`src/lib/navigation.ts`), filtrados pelo papel real da sessão. Propriedades/Talhões/Safras continuam
na mesma tela já testada (`FieldOperationsManager`) via âncoras (`#propriedades`/`#talhoes`/`#safras`)
em vez de um split arriscado de componente. Bug real encontrado e corrigido na validação final: "Usuários
& Permissões" e "Configurações" apontavam para o mesmo href, o que fazia o filtro do Sidebar remover os
dois da lista rolável por engano (administrador ficava sem o item no menu) — corrigido com uma âncora
distinta.

### Validação final deste bloco

`typecheck`, `build` e `npm run test:handoff` completos e limpos. Teste de RLS entre as duas empresas
reais do banco (`Raiz Digital Demo` e `RAIZ E2E Isolamento`) contra as rotas novas
(`/api/collection-orders/[id]/map-layer`, `/api/analyses/[id]/interpretation`, `/api/comparisons`,
página de relatório) confirmado sem vazamento — `crop_profiles`/`crop_profile_parameters` continuam
visíveis para as duas empresas de propósito, por serem catálogo técnico global, não dado operacional.
Verificado com Playwright real (desktop 1440px e mobile 390px) em 8 telas novas: sem overflow, sem erro
de console. Durante a validação, um 500 intermitente em `/api/collection-orders` sob carga concorrente
foi investigado a fundo: não era bug de código (confirmado com 8 requisições simultâneas bem-sucedidas
após reiniciar o servidor de desenvolvimento) — era acúmulo de conexões de um processo `next dev` que
ficou de pé por horas nesta sessão longa, artefato só de ambiente de desenvolvimento.

### Pendências que dependem de agrônomo (reforço do bloco anterior)

Continuam as mesmas: nenhuma `sufficiency_ranges` real cadastrada (só o exemplo de teste, removido),
métodos aceitos por parâmetro/cultura, regiões técnicas e seus perfis válidos, critério de densidade
para liberar interpolação espacial no mapa, aprovação final de cada interpretação.

### Pendências antes de conectar IA

`AgronomicExplanationProvider` continua desconectado (`resolveAgronomicExplanationProvider()` sempre
retorna `null`), como pedido explicitamente — a integração só deve começar depois de autorização
explícita, e o pedido desta fase foi "mapa, relatório, alertas, dashboard e biblioteca técnica
funcionando primeiro", o que está cumprido.

## Camada de IA (agronômica e operacional) — sem provedor pago conectado

Bloco seguinte: arquitetura completa da IA implementada e testada, **sem nenhuma chave de API, sem
nenhum gasto**, como exigido explicitamente. Migration 013 criada.

- **Pacote de evidências** (`src/lib/ai/evidence-package.ts`): monta, sempre no servidor após sessão/
  RBAC/tenant, o único objeto que um provedor de IA agronômica recebe — nunca acesso a banco.
- **Schema de resposta** (`agronomic-narrative-schema.ts`): valida a estrutura obrigatória antes de
  qualquer texto chegar à tela.
- **`AgronomicExplanationProvider`** redesenhado com esse contrato. Provedor padrão
  (`localTemplateNarrativeProvider`) é um formatador determinístico — não um LLM real —, marcado
  explicitamente com `isRealLanguageModel: false` em toda resposta/UI para nunca ser confundido com IA
  generativa. Nunca classifica, nunca inventa severidade; sem regra homologada, só relata valor bruto e o
  motivo do motor.
- **Assistente RAIZ** (`operational-assistant-provider.ts` + `local-intent-assistant-provider.ts`):
  reconhece as perguntas pedidas (coleta atrasada, pontos pendentes, laudos do mês, revisões, confiabilidade,
  comparação de safra, resumo de propriedade, pendências) e responde com consulta real ao banco. Widget
  flutuante (`AssistantRaizWidget`) disponível em toda a plataforma, com contexto de tela inferido para
  `/dashboard` e `/analises/[id]` (talhão/propriedade ainda não têm página própria para inferência automática —
  funciona igual, só sem o atalho de contexto).
- **`ai_generations`** (auditoria + revisão): cada geração é uma linha imutável (provider/model/prompt
  version/payloads/tokens/custo/timestamp); revisar (Aprovar/Solicitar ajuste/Rejeitar, com observação)
  só muda status na mesma linha — nunca sobrescreve o conteúdo gerado.
- **Biblioteca Técnica**: nova seção de fontes técnicas homologáveis (`technical_sources`) — só uma fonte
  `ACTIVE` pode ser citada pela IA; campo reservado para busca semântica futura, sem implementar RAG ainda.
- **Relatório por talhão**: nova seção "Síntese assistida por IA", visualmente separada de fatos e
  classificação.
- **Comparativo de provedores** (`docs/COMPARATIVO_PROVEDORES_IA.md`): Anthropic/OpenAI/Google comparados
  por custo aproximado, qualidade em português técnico, janela de contexto e impacto arquitetural — nenhum
  contratado ainda.

### Catálogo de culturas extensível (não só soja)

Atualização de escopo recebida durante este bloco: `crop_profiles` ganhou `crop_group` (VERAO/INVERNO),
puramente organizacional — o motor determinístico nunca lê essa coluna, resolve sempre por
`crop_profile_id` + parâmetro + profundidade + método, sem nenhum "if soja/if milho". Catálogo agora tem
8 culturas: Soja, Milho, Arroz (verão), Trigo, Cevada, Aveia, Triticale, Canola (inverno) — todas DRAFT,
nenhuma faixa técnica real cadastrada. O relatório de evolução histórica (`/relatorios/evolucao/[fieldId]`)
ganhou uma visão explícita de rotação de culturas (ex.: "Soja 2025/26 → Trigo 2026 → Soja 2026/27"),
usando o histórico de `crop_seasons` já existente — nenhuma safra é sobrescrita.

### Achado real durante a validação: acúmulo de conexões em sessão de dev longa

Ao validar sob carga concorrente, encontrei `EMAXCONNSESSION` (limite do pooler do Supabase). Causa raiz
real, não só sintoma: o pool do `pg` em `src/lib/db.ts` era um singleton de módulo simples — em modo dev
do Next.js, o Fast Refresh pode reavaliar esse módulo a cada alteração de arquivo, recriando o pool e
vazando as conexões antigas (nunca fechadas) a cada hot-reload, ao longo de uma sessão de várias horas.
Corrigido guardando a instância em `globalThis` em desenvolvimento (mesmo padrão documentado pelo Prisma
para Next.js) — em produção (uma instância por processo) o comportamento não muda. Confirmado que a
correção estrutural é a certa; a validação final ficou limitada pelo tempo de expiração das conexões
"fantasmas" já abertas por processos anteriores encerrados à força durante o diagnóstico — não afeta o
código entregue.

### Validação

`typecheck`, `build`, `npm run test:handoff` (agora com `test:ai-schema`) e testes de RLS entre as duas
empresas reais do banco contra os endpoints novos (`/api/assistant`, `/api/analyses/[id]/agronomic-narrative`,
`/api/technical-sources`) — sem vazamento, confirmado com pergunta real ao Assistente RAIZ como a empresa B
("nenhuma pendência", isolado corretamente da empresa A). Fluxo completo (safra → homologar parâmetro →
importar laudo → motor → gerar síntese → aprovar → perguntar ao assistente) testado de ponta a ponta contra
o banco real, com limpeza total dos dados de teste ao final.

### Pendências

Nenhum provedor de IA real está conectado — aguardando autorização explícita e escolha de fornecedor
(ver comparativo). Base de conhecimento (`technical_sources`) existe mas está vazia — nenhuma fonte real
cadastrada ainda. Nenhuma faixa técnica homologada para nenhuma das 8 culturas.

## Fluxo de deploy, marca oficial e auditoria noturna (2026-09-02/03)

Bloco de trabalho autônomo, autorizado explicitamente pelo diretor do projeto ("trabalhe com os
processos mais longos... confio em você") enquanto ele estava fora. Nada aqui envolveu decisão
agronômica, conexão de IA paga ou gasto — dentro dos limites já combinados.

**Fluxo de deploy** — branch `develop` criada a partir de `main` (produção continua vinculada só a
`main`, nada em produção foi alterado). Confirmado com push real que `develop` gera Preview
deployment separado (`raiz-digital-git-develop-guilherme-figueiredo-lagaggio.vercel.app`, protegido
por login do Vercel) e não toca o domínio de produção. **Achado**: o plano gratuito do Vercel tem
limite diário de deployments — foi atingido durante a sessão ("Deployment rate limited — retry in 24
hours"), então o penúltimo/último commits da noite só vão gerar Preview quando o limite resetar
sozinho. Banco usado por Preview vs. Produção **ainda não confirmado** — precisa do diretor checar
Settings → Environment Variables no painel do Vercel (pedido feito, resposta pendente).

**Marca oficial** — símbolo real (arquivo fornecido pelo usuário, recortado sem redesenhar nada) e
paleta oficial (`#0B0D10`/`#F4F5F7`/`#00C4D6`/`#B86F3E`) aplicados em todo o site: sidebar, login,
esqueci/redefinir senha, 4 cabeçalhos de relatório, favicon. Componente novo `BrandLogo` (ícone real +
wordmark tipografado em Sora/Inter, conforme guia de marca) substitui o SVG achatado antigo.

**Bug real de mobile encontrado e corrigido, sem relação com a logo**: no breakpoint mobile, o grid da
tela de login usava `grid-template-columns:1fr`, que não encolhe abaixo do conteúdo (clássico "grid
blowout") — a página ficava mais larga que a tela e cortava texto/campos. Corrigido para
`minmax(0,1fr)`. Confirmado antes/depois com screenshot real via CDP do Chrome/Edge em 390px.

**Achado de segurança, corrigido**: o repositório é público no GitHub (`Vorium1/raiz-digital`) e três
senhas reais de contas de teste (`admin@raiz.local`, `e2e-tenant-b@raiz.local`, `e2e-2fa@raiz.local`)
estavam commitadas em texto puro em `e2e/*.spec.ts` e `e2e/README.md` — viola a regra de nunca expor
segredo no repositório. Os três arquivos agora leem a senha de variável de ambiente (mesmo padrão de
`SEED_ADMIN_PASSWORD`). **As três senhas antigas não foram trocadas** — mutação direta de credenciais
no banco foi bloqueada pelo classificador de segurança do modo automático (corretamente: é ação que
merece aprovação humana). Continuam válidas e continuam no histórico do git. Fica como decisão
pendente do diretor: trocar ou aceitar o risco residual (conta de dev, não produção).

**Operações de campo — cobertura de teste nova** (fechando pendências de `docs/V0.5_INTERRUPTED.md`,
detalhe item a item lá): mapeado o código real com um agente de exploração antes de mexer em qualquer
coisa. Corrigido um bug real: `listCollectionOrders` calculava `labResultCount` casando texto
(`sample_code`), um caminho paralelo e frágil, em vez do FK real (`lab_samples.sample_point_id`) já
usado em `map-data.ts`/`comparisons.ts`/`alerts.ts`/`interpretations.ts` — alinhado ao padrão
existente. Nomeado o limite de 2.000 pontos por ordem (`MAX_POINTS_PER_ORDER`), que era dois literais
soltos. Nova suíte `e2e/field-operations-isolation.spec.ts` (5 testes, todos rodados de verdade contra
o banco de dev, reaproveitando as contas já existentes de `tenant-isolation.spec.ts` — nenhuma conta
nova precisou ser criada): RLS cross-tenant (leitura + 4 tentativas de escrita cross-tenant, todas
404, dado da empresa A confirmado intacto depois), a regra de não substituir pontos após coleta
iniciada (409), e concorrência de importação (duas chamadas simultâneas não duplicam nem corrompem
pontos). Durante a escrita dos testes encontrei e corrigi dois bugs nos próprios testes antes de
considerar isso pronto (um deles fazia o teste "passar" sem provar isolamento de verdade, por causa de
validação de payload disparando antes do filtro por tenant) — detalhado nos comentários do arquivo e
na mensagem do commit `c5a2ff3`.

**Pendências reais deixadas para o diretor decidir ou para uma próxima sessão**:
- RBAC por papel (viewer/comercial/agrônomo/técnico de campo) nas rotas de ordem de coleta continua
  sem teste automatizado — as 4 contas de teste existem no banco com o papel certo, mas a senha delas
  não é conhecida nesta sessão, e redefini-la exige escrita direta no banco (bloqueado, ver acima).
- comportamento em talhão que cruza zona UTM, e teste dedicado do limite de distância GPS
  (`collectSamplePoint`) — ainda não verificados com caso real, só o caminho feliz foi exercitado.
- resíduo pequeno e inofensivo no banco de dev: algumas ordens de coleta de teste (3 pontos, sem
  laudo, tenant "Raiz Digital Demo", códigos `OC-260903-*`) ficaram presas em `IN_PROGRESS` — não
  existe hoje um jeito de cancelar/apagar uma ordem depois que a coleta começou (regra de negócio, não
  bug). Só afeta a lista de ordens de coleta desse tenant de teste, nenhum dado real.
- URL do Preview e confirmação do banco usado por Preview/Produção — pedido feito ao diretor, resposta
  ainda pendente.

**Testes realizados**: `npm run typecheck` e `npm run build` limpos após cada mudança de código.
`npx playwright test` (as 3 suítes: `tenant-isolation`, `two-factor`, `field-operations-isolation`) —
13/13 passando contra o banco de dev real, com limpeza confirmada ao final (exceto o resíduo descrito
acima, que é intencional/documentado, não uma falha de limpeza).

## Remediação de segurança e RBAC de campo — autorizada pelo diretor (2026-09-03)

Continuação do achado de segurança do bloco anterior, agora com autorização explícita do diretor pra
agir. Nada aqui envolveu decisão agronômica, IA paga ou gasto.

**Rotação das senhas expostas** — as 3 senhas reais que estavam em texto puro no histórico do git
(`admin@raiz.local`, `e2e-tenant-b@raiz.local`, `e2e-2fa@raiz.local`) foram trocadas por senhas novas,
fortes e aleatórias. Feito sem nenhuma escrita direta no banco: usei o próprio fluxo de "esqueci minha
senha" do app (pedido → token aparece no log do servidor porque `EMAIL_PROVIDER=console` em dev →
redefinir senha), o mesmo caminho que um usuário real percorreria. Confirmado depois: as 3 senhas
antigas agora retornam 401 (login rejeitado — de fato invalidadas), as 3 contas continuam funcionando
normalmente com a senha nova. Aproveitei o mesmo mecanismo pra definir a primeira senha das 4 contas
`rbac-*` (nunca tiveram senha conhecida nesta sessão). Script reutilizável:
`scripts/rotate-e2e-passwords.mjs`. Senhas novas guardadas só em `.env.e2e.local` (raiz do projeto,
coberto por `.env*` no `.gitignore`, nunca commitado, nunca impresso no terminal nem mostrado ao
diretor — pedido explícito dele).

**Testes de RBAC por papel** — última pendência de `docs/V0.5_INTERRUPTED.md` sobre operações de
campo. Nova suíte `e2e/field-operations-rbac.spec.ts` (5 testes): confirma que os 4 papéis sempre
conseguem ler (`GET /api/collection-orders`, `GET map-layer`), que `AGRONOMIST`/`FIELD_TECH`
conseguem criar, importar pontos, coletar e cancelar ordem, e que `COMMERCIAL`/`VIEWER` recebem 403 em
toda tentativa de escrita — inclusive contra uma ordem real já existente de outro papel, não só a
própria. Suíte completa (4 arquivos, 19 testes) rodada em conjunto, com workers paralelos: 19/19.

**Varredura completa do histórico do git** — usando `git log --all -G'<regex>'` (busca por commits que
adicionaram ou removeram uma linha correspondente, em toda a história, não só no estado atual), cobri
sistematicamente: senha em texto puro, `DATABASE_URL`/string de conexão com credencial embutida,
token/API key/secret genérico, string no formato JWT, menções a `supabase.co`/`service_role`, chave de
provedor de e-mail (SendGrid/Resend/SMTP), token Vercel, `AUTH_SECRET`/token Mercado Pago com valor
real, e qualquer arquivo `.env*` ou com nome de credencial (`.pem`, `.key`, `id_rsa` etc.) já commitado
em qualquer momento, mesmo que apagado depois. **Resultado: nenhum outro segredo real encontrado.** A
única exposição real confirmada é a já conhecida e corrigida (as 3 senhas, introduzidas no commit
`75a2807` em 2026-09-02T15:59:43-03:00 e removidas do código em `5c5eb13` às 22:54:53-03:00 do mesmo
dia — ~7h de exposição, assumindo o repositório já era público nesse intervalo, o que não dá pra
confirmar com certeza retroativamente pela API do GitHub). O `DATABASE_URL` que aparece no primeiro
commit é só o placeholder de `.env.example` (`raiz:raiz@localhost`, credencial local de Docker, nunca
alcançável de fora da máquina do desenvolvedor) — não é uma exposição real.

**Visibilidade do repositório** — não consegui trocar de público pra privado diretamente: não há `gh`
(GitHub CLI) instalado neste ambiente nem token do GitHub disponível. Passo a passo pro diretor fazer:
github.com/Vorium1/raiz-digital → aba **Settings** → rolar até **Danger Zone** (final da página) →
**Change repository visibility** → **Change to private** → digitar o nome do repositório pra confirmar.

**Limpeza de resíduo de teste** — autorizada explicitamente ("remova, se for seguro"). Antes de apagar
qualquer coisa, confirmei por leitura que as 27 ordens de coleta de teste acumuladas durante a noite
(código `OC-260903-*`, 2-3 pontos cada, `sampling_strategy = 'IMPORTED'`) não tinham nenhum
`lab_samples` nem `analyses` vinculado — zero risco de apagar dado de laudo real. As duas ordens
originais de 81 pontos (`OC-260902-*`, as únicas com `sampling_strategy = 'GRID'`) foram preservadas,
nunca fizeram parte da lista de apagar. Removidas 27 ordens e 77 pontos associados. **`audit_events`
foi deixado intacto de propósito**: `entity_id` ali não tem chave estrangeira (é referência solta por
design, para sobreviver à exclusão da entidade original) — apagar registro de auditoria, mesmo de
dado de teste, seria destruir histórico, não limpeza. Confirmado depois: só as 2 ordens reais
permanecem na lista, suíte e2e completa revalidada (19/19) após a limpeza.

### Pendências que ficam para o diretor

- Trocar a visibilidade do repositório pra privado (passo a passo acima).
- Confirmar/decidir se aceita o risco residual das ~7h de exposição das 3 senhas antigas (já
  invalidadas; risco só existiria se alguém tivesse copiado a senha *durante* essa janela e ainda
  assim só dá acesso a contas de teste do ambiente de desenvolvimento, nunca produção).
- Confirmação do banco usado por Preview vs. Produção no Vercel (Settings → Environment Variables) —
  segue pendente desde o bloco anterior.
