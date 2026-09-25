# RAIZ Digital — Master Handoff

Atualizado em **2026-09-25**.

Este arquivo é o handoff operacional para qualquer agente que continue o RAIZ Digital. O histórico completo das fases antigas foi preservado em `docs/PROJECT_STATE.md`.

## 1. Regra principal

**Não começar do zero. Não criar uma “nova RAIZ”. Continue a base existente.**

Antes de alterar código:

1. leia `docs/CURRENT_STATE.md`;
2. leia `CLAUDE.md`;
3. confira issues/PRs abertos;
4. confirme HEAD de `main` e `develop`;
5. confira CI/checks atuais;
6. compare o diff real entre branches.

Não execute tarefas históricas apenas porque aparecem em arquivos antigos.

## 2. Produto

RAIZ Digital é uma plataforma multiempresa de inteligência agronômica.

Assinatura: **Do solo à decisão, com precisão.**

Regra operacional central:

**Entrou laudo e pontos → sai resultado.**

Isso significa:
- concluir tudo o que os dados/evidências suportam;
- não inventar o que estiver ausente;
- não bloquear o relatório inteiro por falta de contexto opcional;
- bloquear apenas a conclusão específica que não tiver base suficiente.

## 3. Estado atual

O snapshot operacional corrente está em `docs/CURRENT_STATE.md`.

No snapshot de 2026-09-25:
- `main` = produção;
- `develop` = desenvolvimento/homologação;
- 42 migrations versionadas;
- CI e Vercel de produção verdes após o release do plano comercial no laudo;
- resumo final do produtor em produção;
- plano comercial opcional congelável no snapshot oficial em produção;
- nenhum bootstrap v0.4/v0.5 precisa ser repetido.

## 4. Arquitetura preservada

- Next.js + React + TypeScript;
- monólito modular;
- PostgreSQL + PostGIS;
- `pg`;
- RLS + RBAC + `tenant_id`;
- sessão opaca em cookie HttpOnly;
- Argon2;
- 2FA/TOTP;
- GeoJSON/WGS84;
- GitHub Actions + Vercel;
- regras agronômicas determinísticas e versionadas.

Não trocar a stack ou o provedor de infraestrutura por preferência pessoal.

## 5. Motor agronômico

A RAIZ não é um chatbot que “opina” sobre um laudo.

O fluxo oficial mantém:
`Importado → Validado → Calculado → Narrativa assistida → Revisão → Aprovado → Publicado`.

IA pode:
- resumir;
- explicar;
- produzir narrativa a partir da saída estruturada;
- auxiliar revisão.

IA não pode:
- inventar método/unidade;
- criar dose sem regra/evidência;
- escolher produto comercial automaticamente;
- substituir decisão determinística;
- publicar recomendação oficial sem os gates correspondentes.

## 6. Camada comercial

A necessidade agronômica e o produto comercial são camadas separadas.

O usuário pode selecionar explicitamente um cenário comercial salvo. O publish valida:
- mesmo tenant/análise;
- mesma área;
- vínculo com a prescrição oficial corrente;
- rastreabilidade;
- limites operacionais.

Somente um cenário congelado no snapshot oficial pode fornecer produto/preço/custo ao laudo.

## 7. Segurança e tenancy

Obrigatório preservar:
- Argon2;
- cookie HttpOnly;
- token opaco + hash;
- 2FA/TOTP;
- RBAC server-side;
- RLS;
- auditoria;
- secrets apenas no ambiente;
- fail-closed quando a evidência obrigatória de uma conclusão estiver ausente.

Nunca use papel administrativo de banco como atalho de runtime.

## 8. Produção

Sem autorização explícita, não:
- fazer merge em `main`;
- promover/deployar produção;
- rodar migration de produção;
- escrever/apagar dados de produção;
- executar ação destrutiva em branch/snapshot de banco.

Pode, sem alterar produção:
- auditar;
- criar issue;
- criar branch;
- implementar em feature branch;
- abrir PR;
- rodar CI;
- validar Preview;
- documentar.

## 9. Fluxo Git

Fluxo padrão:

`feature/* → develop → main`

Antes de integrar:
- confirmar HEAD esperado;
- revisar arquivos alterados;
- exigir CI/checks compatíveis com o risco;
- validar Preview quando houver UI;
- usar QA mobile/print quando o escopo exigir.

Antes de `develop → main`:
- comparar o diff real de arquivos;
- rodar Production Promotion Guard;
- obter autorização explícita.

Os merge commits de release fazem `main` e `develop` divergirem no histórico mesmo quando o conteúdo é igual.

## 10. UX

- simples;
- direta;
- mobile-first;
- sem números fictícios em modo database;
- estados de loading/erro/vazio claros;
- relatório técnico rigoroso;
- resumo final do produtor claro e objetivo.

## 11. Definition of Done

Uma entrega só está concluída quando houver, conforme aplicável:
- código/persistência real;
- autorização server-side;
- isolamento por tenant;
- validação;
- rastreabilidade;
- testes;
- typecheck/build;
- UX desktop/mobile;
- impressão para laudos;
- Preview/QA;
- documentação atualizada.

## 12. Documentação

Fonte corrente:
- `docs/CURRENT_STATE.md`

Contratos:
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/MOTOR_AGRONOMICO.md`
- `docs/ROADMAP_PRODUCT.md`

Histórico:
- `docs/PROJECT_STATE.md`
- `docs/V0.5_INTERRUPTED.md`

Nunca trate um documento histórico como checklist operacional atual sem conferir o estado real do repositório.
