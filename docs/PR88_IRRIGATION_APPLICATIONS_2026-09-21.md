# PR #88 — aplicações de irrigação como evidência opcional

## Ponto de partida

HEAD remoto confirmado antes da edição: `3a5c2f6f0c7b0d4a40e451c3c1af1a877b5fcd36`.
CI inicial: `35552458406`, SUCCESS. Issue #25, incluindo checkpoints de irrigação,
foi lida. Sistema/lâmina/frequência/horário usual já existiam; não foram reimplementados.

## Entrega

- `src/domain/irrigation-applications.ts`: aplicações declaradas pelo usuário, com
  identificador, data local, horário, offset UTC explícito, sistema, lâmina, volume,
  área efetivamente irrigada, eficiência e sua fonte, estádio e observações de
  disponibilidade/qualidade/origem. Campos desconhecidos permanecem nulos.
- Persistência em `analyses.analysis_context.draft.irrigationApplications`, JSONB
  existente. Sem migration ou nova tabela. Sem gravação em banco nesta rodada.
- Editor compartilhado no contexto de entrada e em Resultado → Refinar recomendação.
- GET/PATCH `analyses/[id]/planned-management` retorna/persiste aplicações e preserva
  os demais dados do contexto. PATCH usa `expectedIrrigationApplications` e compara
  com o valor corrente sob `FOR UPDATE`; divergência retorna 409, sem sobrescrever.
- Mantidos sessão/tenant, papéis existentes e audit trail. Atualizar o contexto
  toca a safra para o mecanismo existente de freshness. Não reescreve relatórios.
- Pacote da prescrição recebe `irrigationApplicationEvidence`; requestPayload
  já persiste esse pacote. O provider determinístico expõe o registro operacional
  em managementPractices e mantém as recomendações de nutrientes inalteradas.
- Dados opcionais persistidos inválidos limitam esta camada; o relatório base e
  os outros refinamentos continuam disponíveis. Falha na leitura HTTP não libera
  edição como se o planejamento estivesse vazio.
- Corrigida contradição real anterior: lâmina/intervalo residuais em SEQUEIRO ou
  regime desconhecido não podem sinalizar padrão de irrigação quantificado.

## Cálculo permitido

`depthFromVolumeMm = volumeM3 / irrigatedAreaHa / 10`.

Identidade dimensional: 1 ha = 10.000 m²; 1 mm sobre 1 ha = 10 m³.
Não é regra de dose. Exige volume e área positivos/finitos explicitamente informados.
Não usa automaticamente a área total do talhão. Resultado não finito é descartado.
A lâmina declarada e a convertida são preservadas separadamente: nenhuma é eleita
silenciosamente como verdadeira. Eficiência não é multiplicada pela lâmina.

Data + horário + offset permitem representar o instante UTC. Sem qualquer um deles,
o instante permanece nulo; o servidor não presume fuso ou completa datas.
Data inválida, quantidade negativa, texto no lugar de número e IDs duplicados são
rejeitados em novas gravações. O limite de 100 registros é operacional, não agronômico.

## O que esta entrega não homologa

Não calcula ETc, chuva efetiva, déficit, lixiviação, balanço hídrico, demanda de água,
crédito de nutrientes, lâmina recomendada ou redução de risco climático. O balanço
precisa de séries alinhadas no tempo, armazenamento inicial/capacidade do solo,
chuva, ET, perdas e regras aplicáveis. Qualidade de água permanece texto de evidência;
não há interpretação química automática desses textos.

Não presume que um evento isolado define o regime de toda a safra. Não conecta
automaticamente observações regionais INMET ao instante de irrigação. Esse vínculo
exige suporte temporal e espacial verificado. O gate visual #84 continua separado.

## Verificação

- `npm run test:irrigation-context`: passou.
- `npm run test:irrigation-applications`: passou. Exercita domínio, handlers do
  repositório em adaptador transacional instrumentado, retorno de 409/404, no-op
  independente da ordem de chaves JSONB, preservação/freshness/audit trail,
  provider determinístico e efeitos reais do componente React com rede isolada.
- `npm run typecheck`: passou.
- `npm run test:handoff`: passou; novo teste incluído no comando e no CI existente.
- `test-final-route-permissions.mjs`, `test-homologation-readiness.mjs` e
  `test-analysis-depth-readiness.mjs`: passaram.
- `npm run build`: passou.

Testes de persistência usam o repositório real com adapter instrumentado, não PostgreSQL
ao vivo. Não são apresentados como homologação de RLS ou inspeção visual do Preview.
Fixtures numéricos dos testes não foram gravados em Cabeda. O CI do HEAD publicado
será registrado no checkpoint da issue #25, sem confundir execução local e remota.

## Continuidade

Validar o novo editor no Preview/homologação antes de integração, mantendo #84 aberta.
Proteger produção: nenhum merge, deploy ou migration realizado. PR #83 continua aberto
em `baa6533805d471ff73d520a192c85a06e7d92fe1`; PR #88 mantém a mesma base.
Leitura atual da API confirma main/develop protegidas e issue #24 fechada; o texto antigo
de alguns documentos/PRs sobre ausência de proteção é histórico, não estado corrente.
