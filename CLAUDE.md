# CLAUDE.md — RAIZ Digital

Leia este arquivo **antes de alterar qualquer código**.

## Missão

Continuar a RAIZ Digital a partir do estado real recebido. **Não recomeçar o projeto, não trocar a stack, não redesenhar o produto e não substituir componentes funcionais por preferência pessoal.**

A RAIZ Digital é uma plataforma multiempresa de inteligência agronômica: **“Do solo à decisão, com precisão.”**

## Fonte de verdade do handoff

1. `docs/MASTER_HANDOFF_CLAUDE.md`
2. `docs/PROJECT_STATE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/MOTOR_AGRONOMICO.md`
5. `docs/ROADMAP_PRODUCT.md`
6. `docs/V0.5_INTERRUPTED.md`
7. `docs/brand/Guia_de_Marca_Raiz_Digital.pdf`

## Baseline e snapshot atual

- **Última baseline consolidada:** MVP 0.4.
- **Snapshot recebido:** início da 0.5, interrompido durante o módulo de operações de campo.
- A 0.5 **não está homologada**. O código novo deve ser auditado e testado antes de ser considerado concluído.

## Stack que deve ser preservada

- Next.js + React + TypeScript.
- Monólito modular.
- PostgreSQL + PostGIS como fonte oficial.
- Driver `pg`, sem obrigação de ORM.
- Sessão self-hosted com cookie HttpOnly e token opaco.
- Argon2 para senha.
- RLS + `tenant_id` + RBAC.
- GeoJSON/WGS84 como intercâmbio geoespacial.
- Docker para ambiente local.

Não introduza microserviços, Redis, Firebase, Supabase, Lovable ou serviços pagos apenas por conveniência. Se algum componente adicional for realmente necessário, documente primeiro o motivo e prefira solução gratuita/self-hosted/substituível.

## Regras de produto inegociáveis

- UX simples e direta, especialmente no celular.
- `DATA_MODE=database` nunca pode exibir números, diagnósticos ou recomendações fictícias.
- IA **não decide agronomia**. Regras e cálculos agronômicos oficiais são determinísticos, versionados e homologados.
- Nenhuma recomendação oficial é publicada sem revisão profissional.
- Método analítico, unidade, profundidade, cultura, região e origem do dado devem ser rastreáveis.
- Toda entidade operacional deve respeitar isolamento multiempresa.
- Nunca exponha segredo no frontend ou no repositório.
- Não enfraqueça RLS para “fazer funcionar”.
- Não marque tarefa como concluída sem teste verificável.

## Primeira tarefa obrigatória

Antes de desenvolver mais funcionalidade:

1. inventarie o repositório e leia todos os documentos acima;
2. instale dependências;
3. execute testes existentes;
4. execute `typecheck` e `build`;
5. suba PostgreSQL/PostGIS com Docker;
6. execute migrations 001–004 e seed;
7. valide login real;
8. valide RLS com **dois tenants** e usuários distintos;
9. valide o fluxo 0.5 já iniciado (ordem de coleta, grid, importação de pontos, coleta GPS);
10. corrija o que falhar sem reescrever o que já estiver correto.

Somente depois disso avance a 0.5.

## Forma de trabalhar

- Faça commits pequenos e rastreáveis.
- Não use grandes refactors sem necessidade comprovada.
- Preserve APIs públicas existentes quando possível.
- Atualize `docs/PROJECT_STATE.md` ao final de cada bloco relevante.
- Registre limitações reais; não maquie status.
- Em decisões técnicas ambíguas, escolha a alternativa mais simples, barata, aberta e reversível.

## Definition of Done

Uma funcionalidade só está concluída quando houver, conforme aplicável:

- persistência real;
- autorização server-side;
- isolamento por tenant;
- validação de entrada;
- estados de erro/vazio/carregamento;
- UX desktop e mobile;
- teste automatizado ou E2E compatível com o risco;
- build aprovado;
- documentação de handoff atualizada.

## GitHub target

O repositório oficial deve ser `Vorium1/raiz-digital`, branch `main`. O remote local já está configurado para esse destino. Se ainda não existir remotamente, continue os commits localmente e não publique em outro repositório.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
