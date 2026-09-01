# GitHub — preparação recomendada

Use um repositório **privado dedicado** chamado `raiz-digital` (ou `raiz-digital-platform`). Não misture este código com os repositórios do site Vorium, TRG Motors ou outros produtos.

## Branches

- `main`: somente baseline estável.
- `develop`: integração do próximo bloco, se o fluxo de trabalho precisar.
- branches curtas: `feat/...`, `fix/...`, `chore/...`.

Para um time pequeno, também é aceitável usar `main` + branches curtas + pull request, evitando burocracia desnecessária.

## Primeiro push

O primeiro commit deve representar exatamente este handoff e pode usar a mensagem:

`chore: bootstrap RAIZ Digital from v0.4 baseline and v0.5 field-ops handoff`

Depois, o Claude deve corrigir/validar o snapshot em commits separados, sem esmagar a história em um único commit gigante.

## Segredos

Nunca versionar `.env.local`, senhas, connection strings reais, tokens ou credenciais de provedores.
