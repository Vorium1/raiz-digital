# Ledger de fonte — calagem da soja RS/SC 2025

Data de verificação RAIZ: 2026-09-15.

## Fonte A — publicação regional corrente

- Título: **Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027**.
- Evento/autoria institucional: 44ª Reunião de Pesquisa de Soja da Região Sul.
- Imprenta: Passo Fundo: Embrapa Trigo / Universidade de Passo Fundo, 2025.
- Repositório oficial: Alice / Embrapa.
- URL usada: `https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf`.
- Escopo auditado: capítulo 2, item 2.3, pp. 22–29.

### Evidências localizadas

| Local | Conteúdo usado | Tratamento RAIZ |
|---|---|---|
| p. 23 | pH adequado da soja 5,5–6,0; dose/forma variam por manejo; SMP pode falhar em solo de baixo tamponamento | contexto + gate |
| Tabela 2.2, p. 24 | critérios por sistema; convencional; implantação SPD; consolidado; modo de aplicação; limite superficial | regra/contexto |
| nota (1), p. 24 | não aplicar quando V >=65% e Al <10% | combinada com texto; quadrantes não inequívocos bloqueados |
| notas (2)–(7), p. 24 | P/K, restrições, amostragem, teto 5 t/ha, independência da superfície e SMP médio | gates e warnings |
| item 2.3.1, p. 25 | equações de NC em solo de baixo poder tampão | fórmula determinística delimitada |
| item 2.3.2, pp. 25–26 | convencional: pH<5,5, V<65%, Al>10%; 1 SMP pH6 | regra delimitada |
| item 2.3.3, p. 26 | SPD consolidado: 1/4 da dose para pH6 | **conflita com Tabela 2.2 (1/2)** |
| item 2.3.3, pp. 26–27 | restrição 10–20 cm com Al >=30% e possível reinício do SPD | **conflita com Tabela 2.2 (Al >=10%)**; revisão profissional |
| item 2.3.3, p. 27 | cautela com reinício/erosão; avaliação por engenheiro agrônomo imprescindível | revisão profissional obrigatória |
| item 2.3.3, p. 27 | calagem recente pode não ser detectada pelo SMP; cerca de 3 anos para dissolução completa | bloqueio de reaplicação automática recente |
| item 2.3.4, pp. 27–28 | efeito residual em geral 3–5 anos; nova análise | contexto/monitoramento |
| Tabela 2.3, p. 28 | tabela SMP para pH 5,5/6,0, PRNT100 | dose-base auditada |

## Conflitos preservados, não reconciliados artificialmente

### C1 — fração de SMP no SPD consolidado sem restrições

- Tabela 2.2: **1/2 SMP para pH 6,0**.
- Texto 2.3.3: **1/4 da dose para pH 6,0**.
- Status RAIZ: `BLOCKED_SOURCE_CONFLICT` para dose automática.

### C2 — limiar de Al no SPD consolidado com restrições

- Tabela 2.2: `Al >=10%`.
- Texto 2.3.3: `Al >=30%`.
- Status RAIZ: 10–<30% bloqueado por conflito; >=30% ainda exige decisão profissional de incorporação.

### C3 — lógica V/Al no convencional e no perfil consolidado sem restrições

- Nota (1) da Tabela 2.2: exclusão explícita apenas quando `V >=65%` **e** `Al <10%`.
- Texto 2.3.2: aplicação preconizada quando `V <65%` **e** `Al >10%`.
- Status RAIZ: casos em que os dois trechos concordam podem seguir; quadrantes mistos e `Al=10%` falham fechado.

## Fonte histórica de base

A Tabela 2.3 declara como fonte **CQFS-RS/SC (2016)**. O motor `liming-engine.ts` já mantém a tabela SMP auditada e versionada. O perfil 2025 reutiliza esse núcleo numérico sem reescrever resultados históricos; o que muda é o gate de contexto e a proveniência da decisão corrente para soja.

## Política de promoção

- IA não escolhe entre trechos conflitantes.
- Não se faz média entre 1/2 e 1/4 SMP.
- Não se transforma 10% e 30% em um novo limiar inventado.
- Qualquer errata ou esclarecimento oficial futuro deve entrar como nova versão de evidência, preservando esta execução histórica.
