# Estado do Projeto — RAIZ Digital

Data do handoff: 2026-09-01

## Estado executivo

| Área | Estado | Observação |
|---|---|---|
| Identidade visual | Consolidada | Guia oficial incluído |
| Navegação/UX base | Implementada | Desktop + mobile |
| PostgreSQL/PostGIS | Implementado em código | Precisa validação integrada no novo ambiente |
| Multiempresa | Implementado em código | Validar E2E com 2 tenants |
| RLS | Implementada | Não enfraquecer; validar em banco real |
| Login/sessão | Implementado | Falta endurecimento comercial |
| Clientes | Persistência inicial | CRUD inicial |
| Propriedades | API inicial | UI visual ainda incompleta |
| Talhões | PostGIS + API inicial | Editor/importador de polígono ainda incompleto |
| Safras | Persistência inicial | Integrada ao fluxo de análise |
| Análises | Persistência inicial | Sem parecer oficial automático |
| Importação laboratório CSV | Implementada | CSV longo/amplo; ainda faltam XLSX/PDF |
| Normalização laboratório | Implementada parcialmente | Biblioteca de métodos ainda precisa homologação |
| Índice de confiança | Base técnica existente | Integrar ao motor homologado |
| Operações de campo v0.5 | Em desenvolvimento | Snapshot interrompido; auditar |
| Motor agronômico | Contrato definido | Rule set oficial ainda não implementado/homologado |
| Revisão/aprovação | UI/base conceitual | Fluxo executável ainda pendente |
| Relatório PDF | Pendente | Não simular como pronto |
| Storage S3 | Pendente | Arquivo bruto ainda precisa storage real |
| Worker/fila | Pendente | Preferência inicial: PostgreSQL |
| 2FA/recuperação | Pendente | Obrigatório antes de produção |
| Pagamentos | Apenas base/contrato | Não priorizar antes do núcleo agronômico |
| E2E real | Pendente | Prioridade imediata no novo ambiente |

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
