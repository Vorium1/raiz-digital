# CLAUDE.md — RAIZ Digital

Leia este arquivo **antes de alterar qualquer código**.

## Missão

Continuar a RAIZ Digital a partir do estado real recebido. **Não recomeçar o projeto, não trocar a stack, não redesenhar o produto e não substituir componentes funcionais por preferência pessoal.**

A RAIZ Digital é uma plataforma multiempresa de inteligência agronômica: **“Do solo à decisão, com precisão.”**

## Fonte de verdade da retomada

Leia nesta ordem:

1. `docs/CURRENT_STATE.md` — snapshot curto e atual;
2. `docs/INTEGRATION_READINESS.md` — ancestralidade, Draft PRs e regra anti-retrabalho;
3. issue/checkpoint macro #113 e a issue específica da frente;
4. `docs/PROJECT_STATE.md` — histórico detalhado, não snapshot corrente;
5. documentos técnicos específicos quando a tarefa exigir.

## Baseline e snapshot atual

- A linha técnica recente é o Draft PR #132 (`feature/agronomic-decision-timeline`).
- Frentes posteriores permanecem em Draft PRs separados; não assuma que estão mergeadas.
- Não reaplique PR, commit, migration ou funcionalidade sem conferir ancestralidade e a matriz em `INTEGRATION_READINESS.md`.
- Nunca inferir estado de produção a partir de Preview, branch ou teste local.

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

Antes de desenvolver:

1. ler `docs/CURRENT_STATE.md` e `docs/INTEGRATION_READINESS.md`;
2. conferir a issue/checkpoint relevante e o HEAD/base reais;
3. verificar se já existe branch, commit, teste ou Draft PR equivalente;
4. comparar ancestralidade antes de portar código de branch antiga;
5. executar somente os gates proporcionais à mudança;
6. usar PostGIS local descartável para migrations/testes quando necessário;
7. corrigir o que falhar sem reescrever o que já estiver comprovadamente correto.

Não existe instrução corrente para “voltar à migration 001–004” ou reconstruir a antiga
0.5. Migrations e estado real devem ser obtidos do snapshot atual.

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
