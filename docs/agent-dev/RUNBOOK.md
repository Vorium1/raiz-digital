# Agent Dev v0 — Runbook operacional

## 1. Boot de cada execução

O agente deve executar o seguinte ciclo antes de editar:

1. recuperar contexto do pedido atual;
2. ler `#113`;
3. identificar e ler o issue ativo;
4. pesquisar duplicatas de issue/branch/PR;
5. verificar branch, base e HEAD;
6. verificar CI/checks do HEAD;
7. verificar se existe PR e sua base;
8. inspecionar apenas os arquivos/testes necessários para escolher o próximo passo.

Se a branch ativa estiver quebrada por uma alteração parcial e a nova frente for independente, criar uma branch separada a partir do último commit verde adequado. Não construir infraestrutura nova sobre HEAD sabidamente vermelho sem necessidade.

## 2. Seleção da próxima tarefa

Ordem padrão:

1. falha determinística que bloqueia o issue ativo;
2. item de acceptance ainda não coberto;
3. regressão de segurança/dados;
4. teste que falta para proteger uma regra nova;
5. melhoria de performance/UX já definida no issue;
6. documentação/checkpoint;
7. próximo item independente do backlog.

Se uma dependência externa estiver indisponível, pular temporariamente para item independente em vez de ficar consultando o serviço repetidamente.

## 3. Tamanho das mudanças

Preferir commits que tenham uma intenção clara.

Exemplos bons:
- `fix(auth): make login navigation deterministic`
- `perf(ndvi): keep raster bytes out of metadata JSON`
- `test(report): protect spatial nutrient contract`
- `docs(agent): define production safety boundary`

Evitar commits que misturem regra agronômica, UI, infraestrutura e refatoração sem necessidade.

## 4. Ciclo de correção

Quando um gate falhar:

1. não seguir empilhando feature;
2. abrir job/log;
3. localizar o primeiro erro determinístico;
4. decidir se é falha real ou harness/teste desatualizado;
5. corrigir a causa;
6. adicionar/ajustar regressão;
7. rerodar.

Não “corrigir” um teste reduzindo segurança ou removendo a asserção sem justificar por que o contrato mudou.

## 5. Dependências externas

Exemplos: Vercel rate limit, API oficial indisponível, credencial ausente, serviço de mapa fora.

Nesses casos:
- registrar o bloqueio exato;
- não inventar sucesso;
- não contornar limite com produção;
- continuar em trabalho local/CI/documentação quando possível;
- retomar o gate externo quando estiver disponível.

## 6. Decisões que sobem para o responsável

Só escalar quando a resposta muda produto/negócio ou autoriza risco.

Formato recomendado:

**Decisão necessária:** descrição curta.

**Opção A:** consequência.
**Opção B:** consequência.

**Estado seguro enquanto aguarda:** o que fica congelado.

O agente não deve usar uma pergunta humana para substituir investigação técnica que ele mesmo consegue fazer.

## 7. Encerramento de uma rodada

Antes de parar:
- garantir que o repositório não ficou em estado ambíguo;
- deixar HEAD e branch registrados;
- informar gate em execução, falha ou sucesso;
- comentar issue quando houve avanço material;
- informar exatamente qual é o próximo passo.

Não declarar que continuará “em segundo plano”. A continuação ocorre na próxima execução/turno.
