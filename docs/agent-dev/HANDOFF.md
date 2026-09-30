# Agent Dev v0 — Handoff para Codex / Work / outro agente

Use este arquivo para retomar o RAIZ sem depender de memória informal.

## Prompt mínimo de retomada

> Retome o RAIZ Digital seguindo o AGENTS.md da raiz. Antes de alterar código, leia #113 e o issue ativo, confirme branch/base/HEAD/PR/CI e procure duplicatas. Continue autonomamente em tudo que for seguro e determinístico. Não faça merge, deploy/publicação de produção nem escrita agronômica em produção sem autorização explícita. Depois de cada mudança significativa, rode os gates aplicáveis, corrija falhas determinísticas e registre checkpoint com próximo passo exato.

## O agente precisa recuperar, não assumir

- issue ativo;
- branch correta;
- último HEAD;
- ancestry/base empilhada;
- PR correspondente;
- último CI/check;
- acceptance ainda pendente;
- bloqueios externos.

## Sinais de handoff ruim

- criar branch/issue que já existe;
- começar a codar sem ler o issue;
- usar `develop` como base por hábito sem checar ancestry;
- pedir passos manuais para o responsável sem verificar ferramentas;
- dizer que “está pronto” com CI vermelho;
- fazer polling de CI indefinidamente;
- misturar dado vivo em snapshot publicado;
- transformar ausência de dado em recomendação.

## Sinais de handoff bom

- contexto foi verificado no GitHub;
- próximo passo é pequeno e objetivo;
- limites de produção estão explícitos;
- existe teste que protege o contrato;
- o checkpoint permite outra sessão continuar exatamente dali.
