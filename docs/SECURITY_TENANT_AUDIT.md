# Auditoria de tenant/RBAC das APIs

Escopo inicial: rotas privadas em `src/app/api`, com foco nos identificadores de
recurso em path/query/body. A fonte de tenant deve ser sempre a sessão, nunca o corpo.

| Família | Autenticação | Escopo/isolamento | RBAC de escrita | Evidência |
| --- | --- | --- | --- | --- |
| clientes, propriedades, talhões, safras | `getPlatformSession` | repository + `withTenant`/RLS | contratos de catálogo | `test:tenant-catalog-routes` |
| análises, interpretações, prescrições, relatórios | `getPlatformSession` | tenant da sessão transmitido ao repository | revisão/publicação restrita | contracts de snapshot/freshness |
| coletas e pontos | `getPlatformSession` | coleção e ponto resolvidos no tenant | operação de campo restrita | `test:field`, `test:spatial-map` |
| comercial | `getPlatformSession` | catálogo e plano por tenant | papéis comerciais/técnicos | `test:commercial-*` |
| planejamento | `getPlatformSession` | `withTenant`, FK composta e RLS | admin/agronomist | `test:multiseason-planning-db` |

## Achado corrigido

`POST /api/planning/[id]/calculate` aceitava qualquer sessão autenticada. A rota agora
exige `SUPER_ADMIN`, `TENANT_ADMIN` ou `AGRONOMIST`, alinhada às demais mutações do
planejamento. UUID estrangeiro continua sendo resolvido no tenant da sessão e falha
fechado pelo repository/RLS.

Rotas públicas deliberadas (health, autenticação e webhook com assinatura) não usam a
sessão de tenant e foram mantidas fora desta matriz operacional.
