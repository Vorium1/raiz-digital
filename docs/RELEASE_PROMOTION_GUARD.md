# RAIZ Digital — guard de promoção para `main`

Este documento define um guard adicional para a promoção `develop -> main`.

O objetivo é impedir que um Pull Request de produção pareça apto enquanto gates externos críticos ainda estão abertos. O guard é complementar à proteção de branch; ele **não substitui** ruleset/branch protection e **não autoriza** merge por si só.

## Blockers críticos

Enquanto qualquer uma destas issues estiver aberta, a promoção para `main` deve permanecer bloqueada:

- `#24` — proteção de `main`/`develop`;
- `#25` — homologação externa do Release Candidate atual;
- `#27` — comprovação da proveniência espacial Cabeda no banco autorizado.

A issue `#62` não é blocker global de produção. Ela bloqueia somente a automação do perfil de calagem da soja em SPD consolidado; esse subperfil permanece `REQUIRES_AGRONOMIST_REVIEW`/fail-closed até esclarecimento.

## Como funciona

O domínio puro `src/domain/release-promotion-gate.ts` exige, para uma promoção cujo alvo seja `main`:

1. origem `develop`;
2. estado `closed` para todas as issues críticas;
3. estado desconhecido de issue falha fechado.

O script `scripts/check-release-promotion-gate.mjs` consulta a API do GitHub quando executado em PR para `main`. Fora desse contexto ele é deliberadamente neutro e não adiciona dependência de rede à CI normal de feature/develop/release.

A suíte `test:production-readiness`, que já integra o `test:handoff`, executa esse guard. Isso é importante porque o workflow de CI já existente em `main` faz checkout do conteúdo candidato e executa o `test:handoff`; portanto o blocker pode atuar no PR de promoção atual mesmo antes do novo workflow dedicado existir em `main`.

O workflow `.github/workflows/production-promotion-guard.yml` passa a fornecer um check dedicado para promoções futuras depois que essa infraestrutura estiver presente em `main`.

## Segurança

O guard não lê nem imprime credenciais de banco, Cabeda, e-mail, storage, Copernicus ou Mercado Pago. Ele consulta apenas o estado das issues de governança/homologação.

Quando `GITHUB_TOKEN` estiver disponível, o script o usa apenas para leitura da API. Em repositório público, a consulta também pode funcionar sem token; qualquer falha de consulta vira `unknown` e bloqueia a promoção.

## Limite importante

Enquanto a issue `#24` estiver aberta e `main`/`develop` sem branch protection, um administrador ainda poderia contornar checks por push direto. Este guard reduz risco humano, mas não substitui a proteção administrativa exigida antes do piloto comercial.
