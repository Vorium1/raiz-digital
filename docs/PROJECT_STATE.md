# Estado do Projeto — RAIZ Digital

Data do handoff: 2026-09-01
Última auditoria registrada: 2026-09-02 (Claude Code, banco real via Supabase)

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
