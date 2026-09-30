# RAIZ Digital — Agent Dev v0

Este arquivo governa qualquer agente de desenvolvimento que opere neste repositório.

## Missão

Avançar o RAIZ Digital de forma autônoma, incremental e auditável em todo trabalho que seja tecnicamente determinístico e seguro.

A regra padrão é **continuar avançando**, não parar para pedir confirmação a cada etapa. O agente só deve interromper para uma decisão humana quando a próxima ação ultrapassar os limites definidos aqui.

Comandos curtos do responsável:
- **"Siga" / "Siga avançando"**: executar o próximo trabalho seguro e determinístico do contexto atual.
- **"Pare"**: interromper alterações.
- **"Retome"**: recuperar o último checkpoint verificável e continuar.
- ausência de autorização para produção significa **não publicar produção**.

## Fonte de verdade

Antes de alterar qualquer arquivo:

1. Ler o issue macro `#113`.
2. Ler o issue ativo da frente atual.
3. Procurar issue, branch e PR existentes para não duplicar trabalho.
4. Confirmar branch ativa, base, HEAD real e ancestry quando houver branches empilhadas.
5. Confirmar estado do PR, se existir.
6. Confirmar os gates atuais do HEAD.
7. Ler o código e os testes diretamente relacionados à mudança.

Não confiar em uma porcentagem, comentário antigo ou backlog estático quando GitHub/código atual puder confirmar o estado real.

## Matriz de autonomia

### O agente DEVE fazer sozinho

Sem pedir aprovação adicional, quando dentro do escopo ativo:

- investigar bugs e causa raiz;
- ler issues, PRs, histórico, código, testes e workflows;
- criar branch de trabalho quando não houver uma apropriada;
- criar issue operacional quando a frente ainda não possuir uma e isso evitar trabalho sem rastreabilidade;
- editar código, documentação e testes;
- refatorar sem alterar semântica de negócio;
- adicionar testes de regressão;
- corrigir typecheck, testes, build e CI;
- melhorar desempenho sem enfraquecer segurança, RLS ou cadeia de custódia;
- melhorar UX sem inventar dados agronômicos;
- criar ou atualizar draft PR;
- registrar checkpoints no issue ativo;
- continuar para a próxima tarefa determinística depois de um gate verde;
- quando um serviço externo estiver bloqueado, registrar o bloqueio e avançar em trabalho independente.

Não pedir ao responsável para executar manualmente algo que as ferramentas conectadas disponíveis conseguem executar com segurança.

### Exige autorização explícita ANTES de executar

- merge de PR;
- deploy/publicação em produção;
- alteração de domínio/roteamento de produção;
- escrita, migração destrutiva ou backfill em banco de produção;
- alteração de credenciais, secrets ou provedores de produção;
- exclusão de branches com trabalho ainda útil;
- force-push/rewrite de histórico compartilhado;
- mudança de regra agronômica oficial que ainda não esteja suportada por fonte/regra versionada e aceite na frente técnica;
- qualquer ação irreversível ou com impacto direto em cliente/usuário real.

O agente pode preparar código, migration, plano e testes para essas ações; só não pode executá-las em produção sem aprovação.

### Invariantes — nunca violar

- nunca inventar dose, coordenada, GPS, NDVI, produtividade observada, produto, preço, custo, clima, evidência, laboratório, método, profundidade, CRS ou datum;
- nunca mover ponto GPS real para “caber” no talhão;
- nunca transformar dado ausente em zero;
- nunca usar média espacial como se fosse taxa uniforme quando a regra exigir ponto/zona/faixa;
- nunca completar snapshot publicado com dado vivo de forma silenciosa;
- snapshot publicado é imutável e protegido por hash; falha de integridade é fail-closed;
- nunca enfraquecer autenticação, autorização, RLS ou isolamento multiempresa para “fazer funcionar”;
- nunca tornar cache privado em cache público;
- nunca registrar secrets/tokens em código, issue, teste, fixture ou log;
- falha local de evidência deve usar bloqueio local (`INSUFFICIENT_EVIDENCE` / `REQUIRES_AGRONOMIST_REVIEW`) quando aplicável, sem derrubar conclusões independentes;
- regras determinísticas validadas têm precedência sobre texto gerado;
- relatório do produtor deve ser simples, mas nunca mais assertivo do que a evidência técnica permite.

## Regra de operação contínua

Enquanto houver trabalho seguro e determinístico no issue ativo, o agente deve:

1. escolher a próxima unidade pequena de trabalho;
2. implementar;
3. validar;
4. corrigir o primeiro erro determinístico, se houver;
5. registrar checkpoint quando a mudança for significativa;
6. seguir para a próxima unidade sem pedir “posso continuar?”.

Interromper somente quando:

- houver decisão de produto/negócio sem resposta inferível;
- houver necessidade de autorização explícita da matriz acima;
- faltar uma informação externa que não possa ser obtida pelas ferramentas disponíveis;
- todos os próximos passos estiverem bloqueados;
- o responsável disser “Pare”.

Quando parar por decisão humana, apresentar a decisão em termos concretos, com consequências, sem transferir trabalho técnico desnecessário ao responsável.

## Branches, issues e PRs

- Não criar duplicata: pesquisar primeiro.
- Uma nova frente independente deve preferir branch própria.
- Se a frente depende de trabalho ainda não mergeado, usar branch/PR empilhado sobre a base ancestral mais próxima para manter diff limpo.
- Não apontar automaticamente tudo para `develop` quando isso incluir dezenas de commits alheios ao objetivo.
- Draft PR é permitido autonomamente quando ajuda a auditar a frente.
- PR nunca deve ser mergeado sem autorização explícita.
- Registrar no PR a base empilhada e a dependência quando existir.

## Rotina de testes

Aplicar testes em profundidade progressiva.

### Nível A — durante a implementação

Rodar o teste mais próximo do código alterado e adicionar regressão quando houver bug ou contrato novo.

### Nível B — antes de checkpoint técnico

No mínimo:
- testes estáticos/contratos diretamente afetados;
- `npm run typecheck` quando houver mudança TypeScript relevante.

### Nível C — fechamento da frente

Usar o workflow `.github/workflows/ci.yml`, que inclui:
- typecheck;
- testes de lógica pura;
- preflight de homologação;
- profundidade progressiva das análises;
- build de produção.

Quando houver preview disponível, executar Browser QA/E2E aplicável sem promover produção.

### Regra anti-polling

- no máximo 2 consultas consecutivas ao mesmo run/workflow por rodada;
- se continuar executando e não houver outro trabalho determinístico, registrar o run e parar o polling;
- não confundir “CI ainda executando” com trabalho concluído;
- se falhar, abrir o log e corrigir o primeiro erro determinístico antes de empilhar mais mudanças.

## Dados e ambientes

- Preferir fixtures, mocks, banco de teste/homologação e leitura segura.
- Scripts capazes de escrever dados devem declarar ambiente e proteção explicitamente.
- Produção é somente leitura por padrão.
- Nenhuma escrita agronômica em produção sem autorização explícita.
- Migrações podem ser desenvolvidas/testadas sem serem aplicadas em produção.

## Performance

Otimização é permitida autonomamente desde que:
- preserve autenticação/RLS;
- preserve semântica agronômica;
- preserve snapshots e hashes;
- não faça cache público de informação privada;
- não esconda falhas com fallback inconsistente;
- não altere o significado de recomendações para ganhar velocidade.

## Relatórios e agronomia

O fluxo esperado é: **entrou laudo + pontos/contexto suficiente → sai resultado**.

Antes de declarar um relatório pronto:
- auditar antecipadamente doses/correções que deveriam aparecer;
- resolver lacunas técnicas na engenharia, não descobrir tudo somente no PDF final;
- quando não houver dose única segura, mostrar decisão espacial/faixa/bloqueio limpo conforme a regra;
- totais do talhão só podem ser derivados de área e taxa tecnicamente válidas;
- custo-benefício só pode ser calculado com produto, concentração, preço, equipamento/logística necessários;
- clima e biologia são contexto salvo/congelado e não alteram dose automaticamente sem regra homologada.

## Checkpoint obrigatório

Após mudança significativa, registrar no issue ativo:

```
Item/Frente — nome: estado real

Concluído nesta rodada:
- ...

Estado:
Branch:
Base:
HEAD:
CI:
Browser QA:
PR:
Bloqueios externos:
Próximo passo exato:
- ...
```

Percentuais são opcionais e nunca substituem o estado verificável.

## Backlog

A rotina de priorização está em `docs/agent-dev/BACKLOG.md`.

O agente deve tratar GitHub + código como fonte atual e usar o arquivo apenas como política/seed de fila.

## Handoff

Para continuar o projeto em Codex, Work ou outro agente, seguir `docs/agent-dev/HANDOFF.md`.

## Definição de pronto do Agent Dev

Uma frente só pode ser chamada de tecnicamente pronta quando:
- acceptance do issue foi coberto;
- testes relevantes passaram;
- CI do HEAD está verde, salvo bloqueio externo explicitamente documentado;
- Browser QA necessário foi executado ou marcado como bloqueado externamente;
- issue/PR receberam checkpoint;
- nenhum merge/deploy de produção ocorreu sem autorização.
