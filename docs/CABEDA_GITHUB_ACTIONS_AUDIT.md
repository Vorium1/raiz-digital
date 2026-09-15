# Auditoria Cabeda via GitHub Actions

## Objetivo

Permitir a comprovação read-only da proveniência espacial persistida de Cabeda Área 01/02 no banco autorizado de homologação sem copiar credenciais, coordenadas ou arquivos privados para o repositório.

## Por que existem dois modos de disparo

O repositório usa `main` como branch padrão. O GitHub só disponibiliza `workflow_dispatch` quando o arquivo do workflow existe na branch padrão. Como a auditoria Cabeda é um **gate anterior ao merge em `main`**, depender apenas do botão manual criaria um ciclo impossível: precisaríamos publicar o workflow em produção antes de conseguir executar uma homologação exigida para publicar.

Por isso o workflow possui dois caminhos controlados:

1. `workflow_dispatch`: disponível normalmente depois que o workflow existir em `main`;
2. `push` exclusivamente nas branches `audit/cabeda-area01` ou `audit/cabeda-area02`, e somente quando um arquivo em `.audit-trigger/**` for alterado.

No modo pré-`main`, o workflow **não executa o código da branch de gatilho**: o checkout usado para a auditoria é explicitamente `develop`. Assim, a branch `audit/**` funciona apenas como sinal de execução para o código já integrado e testado.

Nunca há disparo em `pull_request`, `feature/**`, `release/**` ou qualquer outra branch.

## Secrets necessários

Configurar preferencialmente no GitHub Environment `homologation`:

- `HOMOLOGATION_DATABASE_URL`: conexão PostgreSQL do banco autorizado de homologação;
- `CABEDA_TENANT_ID`: tenant explicitamente autorizado;
- `CABEDA_ACTOR_USER_ID`: opcional, para aplicar o contexto de usuário da auditoria quando necessário.

O workflow valida somente a presença dos secrets. Seus valores não são impressos nem gravados em artifacts.

## Execução antes de `main`

Para Área 01:

1. criar/atualizar a branch `audit/cabeda-area01` a partir do `develop` já aprovado;
2. criar ou atualizar um marcador em `.audit-trigger/area01`;
3. o push dispara `Cabeda Spatial Provenance Audit`;
4. o próprio workflow faz checkout de `develop` e executa a auditoria com os secrets do environment `homologation`.

Para Área 02, usar `audit/cabeda-area02` e `.audit-trigger/area02`.

## Execução pelo botão Actions

Depois que o workflow existir na branch padrão:

1. abrir **Actions** no repositório;
2. selecionar **Cabeda Spatial Provenance Audit**;
3. escolher **Run workflow**;
4. selecionar Área `01` ou `02`;
5. executar.

Área 03 não é oferecida e continua rejeitada pelo script de domínio.

## Segurança

A execução chama `scripts/audit-cabeda-persisted-geometry.mjs`, que:

- abre transação `READ ONLY`;
- define explicitamente o tenant autorizado;
- não faz `UPDATE`, `INSERT` ou `DELETE`;
- termina com `ROLLBACK`;
- não imprime latitude/longitude;
- aceita apenas as proveniências reais explicitamente homologadas pelo domínio;
- falha fechado quando o contexto é ausente, ambíguo ou inconsistente.

O job tem `permissions: contents: read`, usa o environment `homologation` e possui `concurrency` para evitar duas auditorias Cabeda simultâneas.

Em erro operacional de banco/conexão, o workflow não publica o arquivo de stderr, reduzindo o risco de expor detalhes de infraestrutura. O artifact é criado somente quando existe resultado privacy-safe da auditoria.

## Interpretação

`readyForReliableSpatialEvidence=true` resolve apenas a pergunta: **a geometria persistida deste talhão tem proveniência espacial real e auditável?**

Isso não libera VRA/taxa variável por si só. Continuam independentes os gates de suporte amostral, política espacial ativa, qualidade do atributo, máscara/suporte, validação espacial e aprovação profissional.

Se a saída for `false`, se os secrets não estiverem configurados ou se a auditoria não puder ser concluída, o job termina vermelho e a issue #27 deve permanecer aberta.

## Rastreabilidade

- Issue de implementação: #66.
- Blocker externo: #27.
- Homologação do RC: #25.
