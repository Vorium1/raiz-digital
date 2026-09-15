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
| item 2.3.3, p. 26 | SPD consolidado: 1/4 da dose para pH6 | redação narrativa desatualizada; C1 resolvido pela Fonte B |
| item 2.3.3, pp. 26–27 | restrição 10–20 cm com Al >=30% e possível reinício do SPD | redação narrativa desatualizada; C2 resolvido pela Fonte B; incorporação segue sob revisão profissional |
| item 2.3.3, p. 27 | cautela com reinício/erosão; avaliação por engenheiro agrônomo imprescindível | revisão profissional obrigatória |
| item 2.3.3, p. 27 | calagem recente pode não ser detectada pelo SMP; cerca de 3 anos para dissolução completa | bloqueio de reaplicação automática recente |
| item 2.3.4, pp. 27–28 | efeito residual em geral 3–5 anos; nova análise | contexto/monitoramento |
| Tabela 2.3, p. 28 | tabela SMP para pH 5,5/6,0, PRNT100 | dose-base auditada |

## Fonte B — ata oficial que registra as alterações aprovadas

- Título: **44ª Reunião de Pesquisa de Soja da Região Sul — Atas e Resumos 2025**.
- Evento: 13 e 14 de agosto de 2025, Passo Fundo, RS.
- Repositório oficial: Infoteca / Embrapa.
- URL usada: `https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1183119/1/Atas-e-Resumos-2025.pdf`.
- Escopo auditado: item 7.4, “Atualizações das indicações técnicas”, Capítulo 2 — Calagem e adubação.

### Deliberações relevantes

A ata registra explicitamente duas atualizações para a Tabela 2.2:

1. **SPD consolidado sem restrições na camada 10–20 cm:** ajustar a dose de calcário de `1/4` para **`1/2 SMP`**, com pH em água alvo igual a 6,0.
2. **SPD consolidado com restrições na camada 10–20 cm:** usar **pH em água <=5,5 e saturação por Al >=10%** como critério atualizado. A Tabela 2.2 publicada operacionaliza o pH como `<5,5`; a RAIZ preserva o operador da tabela corrente e usa a ata para resolver especificamente o limiar de Al.

A Fonte B não contém deliberação equivalente sobre a divergência lógica V/Al da nota (1) versus o item 2.3.2. Esse terceiro ponto permanece bloqueado.

## Conflitos e resolução versionada

### C1 — fração de SMP no SPD consolidado sem restrições

- Tabela 2.2: **1/2 SMP para pH 6,0**.
- Texto 2.3.3: **1/4 da dose para pH 6,0**.
- Ata oficial, item 7.4: determina a alteração **de 1/4 para 1/2 SMP, pH-alvo 6,0**.
- Status RAIZ em 2026-09-15: **RESOLVIDO POR ESCLARECIMENTO OFICIAL**. Usa-se `1/2 SMP` apenas no contexto delimitado; aplicação superficial limitada a 5 t/ha PRNT100.

### C2 — limiar de Al no SPD consolidado com restrições

- Tabela 2.2: `Al >=10%`.
- Texto 2.3.3: `Al >=30%`.
- Ata oficial, item 7.4: determina modificar o critério para **Al >=10%**.
- Status RAIZ em 2026-09-15: **RESOLVIDO POR ESCLARECIMENTO OFICIAL**. A decisão de incorporação continua exigindo revisão/confirmação profissional; após confirmação, a dose usa 1 SMP para pH6 pelo SMP médio das camadas 0–10 e 10–20 cm.

### C3 — lógica V/Al no convencional e no perfil consolidado sem restrições

- Nota (1) da Tabela 2.2: exclusão explícita quando `V >=65%` **e** `Al <10%`.
- Texto 2.3.2: aplicação preconizada quando `V <65%` **e** `Al >10%`.
- A ata oficial consultada não registra alteração que resolva os quadrantes mistos ou `Al=10%`.
- Status RAIZ: **ABERTO / FAIL-CLOSED**. Casos em que os dois trechos concordam podem seguir; quadrantes mistos e `Al=10%` continuam `BLOCKED_SOURCE_CONFLICT`.

## Fonte histórica de base

A Tabela 2.3 declara como fonte **CQFS-RS/SC (2016)**. O motor `liming-engine.ts` mantém a tabela SMP auditada e versionada. O perfil 2025 reutiliza esse núcleo numérico sem reescrever resultados históricos; o que muda é o gate de contexto e a proveniência da decisão corrente para soja.

## Política de promoção aplicada

- Um conflito só é retirado quando a fonte oficial identifica explicitamente a alteração; proximidade editorial ou preferência técnica não bastam.
- C1 e C2 foram promovidos porque a própria Ata da 44ª RPSRS registra as alterações aprovadas.
- C3 não foi promovido e permanece fail-closed.
- No SPD com restrições, a IA não decide reinício/incorporação; `agronomistConfirmedIncorporationDecision=true` é gate humano obrigatório antes do cálculo determinístico da dose.
- Histórico não é reprocessado automaticamente; a mudança vale para a versão corrente da regra e deve permanecer rastreável pela fonte de esclarecimento.