# RAIZ Digital — Estado atual

Snapshot: **2026-09-25**  
Repositório: `Vorium1/raiz-digital`

Este arquivo é a fonte curta de verdade para o estado operacional atual. Para histórico detalhado das fases anteriores, consulte `docs/PROJECT_STATE.md`.

## Branches e release

- `main` é produção.
- `develop` é desenvolvimento/homologação.
- Fluxo obrigatório: feature branch → PR para `develop` → CI/Preview/QA → autorização explícita → merge em `develop` → PR de release `develop → main` → Production Promotion Guard → autorização explícita → merge em `main`.
- No snapshot desta data:
  - `main`: `92ea2646d6af42ef62df3eaad0501d4a1c423a3d`;
  - `develop`: `7b6a7ebaf03edaa8d4f0b60d9e30209ac797b240`;
  - não há diferença de arquivos entre `main` e `develop`; `main` está à frente apenas por commits de merge/release.
- CI pós-release da `main`: run `36076087720` = **SUCCESS**.
- Status Vercel do commit de produção: **SUCCESS**.
- O conector operacional usado durante esta auditoria não forneceu um alias público canônico confiável; não inventar URL de produção a partir de Preview ou dashboard.

## Banco e migrations

- PostgreSQL + PostGIS continuam sendo a fonte oficial.
- O repositório contém **42 migrations** versionadas, de `001_initial.sql` a `042_ndvi_algorithm_versioned_snapshots.sql`.
- A evidência de release anterior documenta produção e homologação em **42/42**.
- As releases #92 e #95 não adicionaram migrations nem alteraram schema.
- O runtime deve continuar usando papel restrito, RLS e contexto de tenant; nunca usar papel administrativo como atalho para a aplicação.

## Produto já implementado

### Núcleo operacional
- autenticação persistente, sessão HttpOnly, Argon2, 2FA/TOTP, recuperação de senha e gestão de equipe;
- multiempresa com RLS/RBAC;
- clientes, propriedades, talhões, safras/culturas e laboratórios;
- ordens de coleta, pontos GPS, grid e confirmação de campo;
- importação laboratorial CSV/XLSX com proveniência e rastreabilidade;
- auditoria de ações;
- mapas de fertilidade/pontos/satélite;
- NDVI versionado com custódia de raster;
- relevo/fallbacks de mapa;
- estados mobile e UX simplificada.

### Inteligência agronômica
- motor determinístico com regras versionadas;
- interpretação e prescrição revisáveis/aprováveis;
- contexto de cultura, produtividade, profundidade, região e método;
- P, K, N, S, calagem e demais blocos implementados conforme regras/evidências cadastradas;
- cenários comerciais separados da necessidade agronômica;
- análise biológica, clima, irrigação e demais contextos entram como enriquecimento quando disponíveis;
- nenhuma ausência opcional deve impedir o relatório inteiro quando houver conclusão válida com os dados existentes.

### Laudo oficial
- snapshot oficial imutável/versionado;
- resumo final simples para o produtor;
- dose por hectare e total da área quando o cálculo é exato;
- nutrientes equivalentes não são confundidos com massa de fertilizante comercial;
- plano comercial pode ser selecionado explicitamente no publish;
- produto, dose comercial, quantidade total, preço e custo só aparecem quando o cenário foi congelado no laudo;
- cenário stale, sem rastreabilidade ou com violação operacional falha fechado;
- o plano comercial já publicado é preservado por padrão na republicação para evitar remoção acidental.

## Releases recentes

### PR #92 — resumo final do produtor
- merge em `main`: `abf96a2dcba858188235dffed4621bdbdfaa1e79`;
- CI e Vercel pós-release: sucesso;
- nenhuma migration/schema change.

### PR #95 — plano comercial no laudo oficial
- merge em `main`: `92ea2646d6af42ef62df3eaad0501d4a1c423a3d`;
- CI pós-release `36076087720`: sucesso;
- Vercel Production: sucesso;
- QA pré-release: desktop, mobile 390×844 e impressão;
- nenhuma migration/schema change.

## Regras de segurança para continuar o projeto

1. Não fazer merge em `main`, deploy/promote de produção, migration de produção ou escrita destrutiva no banco sem autorização explícita.
2. Não inventar dose, custo, produto, preço, coordenada, NDVI, produtividade ou evidência científica.
3. IA não substitui o motor determinístico nem a revisão profissional.
4. Preservar rastreabilidade de método, unidade, profundidade, região, fonte e versão da decisão.
5. Mudança agronômica exige teste determinístico e evidência correspondente.
6. Mudança visual relevante exige validação desktop/mobile; impressão também quando afeta laudo.
7. Antes de nova release, comparar `main → develop` pelo diff real, não apenas pela contagem de commits, porque os merges de release fazem o histórico divergir.
8. Se o estado do GitHub, Vercel ou banco puder ter mudado, consultar a fonte atual antes de agir.

## Handoff recomendado

Antes de qualquer nova implementação:

1. leia este arquivo;
2. leia `CLAUDE.md`;
3. confira issues/PRs abertos;
4. confirme HEAD de `main` e `develop`;
5. execute/consulte CI atual;
6. só então escolha o próximo bloco.

Não repetir bootstrap histórico, migrations antigas ou operações de release já concluídas apenas porque aparecem em documentos de arquivo.
