# CLAUDE.md — RAIZ Digital

Leia este arquivo **antes de alterar qualquer código**.

## Missão

Continuar a RAIZ Digital a partir do estado real atual. **Não recomeçar o projeto, não trocar a stack, não redesenhar o produto e não substituir componentes funcionais por preferência pessoal.**

A RAIZ Digital é uma plataforma multiempresa de inteligência agronômica: **“Do solo à decisão, com precisão.”**

## Fonte de verdade

Leia nesta ordem:

1. `docs/CURRENT_STATE.md` — snapshot operacional atual;
2. este `CLAUDE.md`;
3. `docs/ARCHITECTURE.md`;
4. `docs/MOTOR_AGRONOMICO.md`;
5. `docs/ROADMAP_PRODUCT.md`;
6. `docs/PROJECT_STATE.md` — histórico, não checklist atual;
7. documentação técnica específica da feature em questão.

Não use instruções antigas de bootstrap ou release como se ainda fossem pendências. Confirme o estado atual no GitHub/CI/banco antes de agir.

## Baseline atual

O snapshot antigo “MVP 0.4 / início da 0.5” é histórico.

No snapshot de 2026-09-25:
- `main` está em produção;
- `develop` é desenvolvimento/homologação;
- o repositório contém 42 migrations;
- as releases recentes do resumo do produtor e do plano comercial já foram publicadas;
- `main` e `develop` podem divergir em histórico por commits de merge mesmo quando o diff de arquivos é zero.

Consulte `docs/CURRENT_STATE.md` para os SHAs e gates registrados nesta data.

## Stack que deve ser preservada

- Next.js + React + TypeScript.
- Monólito modular.
- PostgreSQL + PostGIS como fonte oficial.
- Driver `pg`, sem obrigação de ORM.
- Sessão self-hosted com cookie HttpOnly e token opaco.
- Argon2 para senha.
- RLS + `tenant_id` + RBAC.
- GeoJSON/WGS84 como intercâmbio geoespacial.
- GitHub Actions + Vercel no fluxo atual de release.

Não introduza microserviços, Redis, Firebase, Lovable ou serviços pagos apenas por conveniência. Não troque o provedor de PostgreSQL nem outras peças de infraestrutura por preferência pessoal. Se algo adicional for necessário, documente o motivo e prefira solução simples, barata, aberta e reversível.

## Regras de produto inegociáveis

- UX simples e direta, especialmente no celular.
- `DATA_MODE=database` nunca pode exibir números, diagnósticos ou recomendações fictícias.
- IA **não decide agronomia**. Regras e cálculos agronômicos oficiais são determinísticos, versionados e homologados.
- Nenhuma recomendação oficial é publicada sem revisão profissional.
- Método analítico, unidade, profundidade, cultura, região e origem do dado devem ser rastreáveis.
- Toda entidade operacional deve respeitar isolamento multiempresa.
- Nunca exponha segredo no frontend ou no repositório.
- Não enfraqueça RLS, gates de publicação ou validações fail-closed para “fazer funcionar”.
- Não marque tarefa como concluída sem teste verificável.
- Ausência de contexto opcional pode reduzir precisão, mas não deve impedir conclusões que já são suportadas pelos dados disponíveis.
- Nunca invente dose, custo, produto, preço, GPS, NDVI, produtividade ou evidência científica.

## Regra de produção

Sem autorização explícita, **não**:
- fazer merge em `main`;
- promover/deployar produção;
- executar migration de produção;
- escrever ou apagar dados de produção;
- executar operação destrutiva no banco.

Abrir issue, criar branch/PR, revisar código, rodar CI, validar Preview e produzir documentação são ações seguras quando não alteram produção.

## Primeira tarefa de qualquer retomada

1. leia `docs/CURRENT_STATE.md`;
2. confira issues e PRs abertos;
3. confirme HEAD de `main` e `develop`;
4. compare o diff real entre as branches;
5. confira os checks/CI atuais;
6. identifique o próximo gap real antes de escrever código.

Não rerode migrations históricas, seeds, restores ou releases só porque documentos antigos mencionam esses passos.

## Forma de trabalhar

- Faça commits pequenos e rastreáveis.
- Não use grandes refactors sem necessidade comprovada.
- Preserve APIs públicas existentes quando possível.
- Atualize `docs/CURRENT_STATE.md` quando um release ou mudança estrutural tornar o snapshot obsoleto.
- Preserve `docs/PROJECT_STATE.md` como histórico detalhado.
- Registre limitações reais; não maquie status.
- Em decisões técnicas ambíguas, escolha a alternativa mais simples, barata, aberta e reversível.
- Antes de release, confira o diff `main → develop` por arquivos, porque o histórico pode divergir apenas por merges.

## Definition of Done

Uma funcionalidade só está concluída quando houver, conforme aplicável:

- persistência real;
- autorização server-side;
- isolamento por tenant;
- validação de entrada;
- estados de erro/vazio/carregamento;
- UX desktop e mobile;
- impressão quando afetar laudo;
- teste automatizado ou E2E compatível com o risco;
- build aprovado;
- documentação de handoff atualizada.

## GitHub target

Repositório oficial: `Vorium1/raiz-digital`.

- `main` = produção;
- `develop` = desenvolvimento/homologação;
- feature branches devem preferencialmente nascer de `develop`.
