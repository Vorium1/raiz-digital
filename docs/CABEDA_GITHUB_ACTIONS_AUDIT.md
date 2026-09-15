# Auditoria Cabeda via GitHub Actions

## Objetivo

Permitir a comprovação read-only da proveniência espacial persistida de Cabeda Área 01/02 no banco autorizado de homologação sem copiar credenciais, coordenadas ou arquivos privados para o repositório.

O workflow é exclusivamente manual (`workflow_dispatch`). Ele nunca roda em `push` ou `pull_request`.

## Secrets necessários

Configurar preferencialmente no GitHub Environment `homologation`:

- `HOMOLOGATION_DATABASE_URL`: conexão PostgreSQL do banco autorizado de homologação;
- `CABEDA_TENANT_ID`: tenant explicitamente autorizado;
- `CABEDA_ACTOR_USER_ID`: opcional, para aplicar o contexto de usuário da auditoria quando necessário.

O workflow valida somente a presença dos secrets. Seus valores não são impressos nem gravados em artifacts.

## Execução

1. Abrir **Actions** no repositório.
2. Selecionar **Cabeda Spatial Provenance Audit**.
3. Escolher **Run workflow**.
4. Selecionar Área `01` ou `02`.
5. Executar.

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

Em erro operacional de banco/conexão, o workflow não publica o arquivo de stderr, reduzindo o risco de expor detalhes de infraestrutura. O artifact é criado somente quando existe resultado privacy-safe da auditoria.

## Interpretação

`readyForReliableSpatialEvidence=true` resolve apenas a pergunta: **a geometria persistida deste talhão tem proveniência espacial real e auditável?**

Isso não libera VRA/taxa variável por si só. Continuam independentes os gates de suporte amostral, política espacial ativa, qualidade do atributo, máscara/suporte, validação espacial e aprovação profissional.

Se a saída for `false`, ou se a auditoria não puder ser concluída, o job termina vermelho e a issue #27 deve permanecer aberta.

## Rastreabilidade

- Issue de implementação: #66.
- Blocker externo: #27.
- Homologação do RC: #25.
