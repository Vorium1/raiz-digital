# Agent Dev v0 — Backlog operacional

Este arquivo define **como priorizar**, não substitui os issues do GitHub. Sempre refrescar o estado real antes de executar.

## Algoritmo da fila

### P0 — integridade e gates
- CI vermelho no HEAD ativo;
- regressão de autenticação/RLS;
- risco de corrupção/mutação de snapshot;
- inconsistência entre regra determinística e recomendação publicada;
- risco de escrita/produção não autorizada.

### P1 — acceptance ativo
Concluir o issue já em andamento antes de abrir nova frente, exceto quando:
- estiver bloqueado externamente;
- a nova frente for explicitamente solicitada pelo responsável;
- separar a frente reduzir risco/contaminação.

### P2 — qualidade operacional
- regressões E2E/Browser QA;
- performance de rotas críticas;
- UX que reduz erro operacional;
- observabilidade, testes e documentação.

### P3 — dívida não bloqueante
- refatorações;
- limpeza;
- otimizações secundárias;
- documentação adicional.

## Seed atual de referências

Antes de usar esta lista, consultar os issues:

- `#113` — checkpoint macro Itens 1–10;
- `#123` / draft PR `#124` — Resultados + relatório oficial; HEAD técnico verde `c19de5e...`, sem merge;
- `#125` — Agent Dev v0;
- `#126` — Item 10: linha do tempo / reconstrução da decisão agronômica — próxima frente P1;
- `#127` — Planejamento Plurissafras separado do laudo oficial — fila posterior, somente após #126 ou bloqueio externo.

O estado desses itens muda. O agente não deve assumir que “aberto” significa “ativo agora” nem que um percentual antigo ainda é válido.

## Próximo item quando o usuário disser apenas “Siga”

1. identificar qual frente estava ativa no último checkpoint;
2. validar estado real;
3. se houver falha determinística, corrigir;
4. se #123/#124 continuar verde e o único passo restante for merge, NÃO mergear: registrar o estado e iniciar #126 em branch empilhada limpa;
5. concluir acceptance do #126 antes de abrir trabalho substancial do #127, salvo bloqueio externo;
6. se a frente estiver tecnicamente pronta e sem decisão humana, registrar e passar ao próximo item macro elegível;
7. se merge/deploy/produção for o único passo restante, parar e pedir autorização específica.

## Regra de bloqueio externo

Se um item depende de preview/API externa indisponível:
- marcar `BLOCKED_EXTERNAL`;
- manter o item aberto;
- avançar em outro trabalho independente;
- não repetir polling improdutivo.
