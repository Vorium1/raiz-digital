# Calagem da soja RS/SC — perfil 2025

## Fontes primárias

1. **Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027** — 44ª Reunião de Pesquisa de Soja da Região Sul, Passo Fundo, 2025.
   - publicação: `https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf`
   - locais usados: item 2.3, pp. 22–29; especialmente Tabela 2.2 (p. 24), item 2.3.1 (p. 25), itens 2.3.2–2.3.4 (pp. 25–28) e Tabela 2.3 (p. 28).

2. **44ª Reunião de Pesquisa de Soja da Região Sul — Atas e Resumos 2025**.
   - ata oficial: `https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1183119/1/Atas-e-Resumos-2025.pdf`
   - local usado: item 7.4, “Atualizações das indicações técnicas”, Capítulo 2 — Calagem e adubação.

A ata oficial é usada como esclarecimento normativo das alterações aprovadas pela própria 44ª RPSRS. Ela resolve explicitamente duas divergências editoriais que permaneceram no texto narrativo da publicação final.

## O que é inequívoco e foi implementado

### Sistema convencional

No domínio em que os critérios são simultaneamente inequívocos — `pHágua < 5,5`, `V < 65%` e saturação por Al `> 10%` — a dose-base é `1 SMP para pHágua 6,0`, incorporada em 0–20 cm. A Tabela 2.3 reproduz as doses de SMP para PRNT 100%.

A edição 2025 mantém uma diferença lógica entre a nota (1) da Tabela 2.2 e a redação do item 2.3.2. A nota diz para **não aplicar** quando `V >= 65%` **e** `Al < 10%`; o texto afirma que a calagem é preconizada quando `V < 65%` **e** `Al > 10%`. Nos quadrantes mistos e em `Al = 10%`, a RAIZ não escolhe silenciosamente uma interpretação: retorna conflito de fonte e bloqueia dose automática.

### Implantação do sistema plantio direto

A Tabela 2.2 é direta: amostragem 0–20 cm, decisão `pHágua < 5,5`, `1 SMP para pHágua 6,0`, com incorporação. O motor só atua quando o sistema informado corresponde explicitamente a esse contexto.

### SPD consolidado sem restrições na camada 10–20 cm

A Tabela 2.2 corrente informa:

- amostragem 0–10 cm, mantendo 0–10 e 10–20 amostrados separadamente para o diagnóstico do sistema;
- decisão `pHágua < 5,5`, sujeita à nota (1): não aplicar quando `V >= 65%` e `Al < 10%`;
- quantidade `1/2 SMP para pHágua 6,0`;
- aplicação superficial;
- limite de `5 t/ha` para PRNT 100%.

O texto narrativo do item 2.3.3 ainda registra `1/4` SMP, porém a **Ata oficial da 44ª RPSRS, item 7.4, determina expressamente alterar a Tabela 2.2 de 1/4 para 1/2 SMP com pH-alvo 6,0**. Portanto, essa divergência deixa de ser tratada como conflito não resolvido.

A automação é liberada somente quando:

- o contexto estiver explicitamente classificado como SPD consolidado sem restrições em 10–20 cm;
- `noRestrictions10To20Confirmed=true`;
- a calagem não for recente a ponto de acionar o gate de reaplicação;
- pH/V/Al/SMP necessários forem válidos;
- a lógica V/Al cair no domínio inequívoco. Quadrantes mistos continuam fail-closed porque a ata não resolveu essa terceira divergência.

### SPD consolidado com restrições na camada 10–20 cm

A Tabela 2.2 corrente informa:

- decisão baseada na camada 10–20 cm, independente da condição de 0–10 cm;
- `pHágua < 5,5` **e** saturação por Al `>= 10%`;
- `1 SMP para pHágua 6,0`;
- uso do **SMP médio das camadas 0–10 e 10–20 cm** para definir a dose;
- aplicação incorporada.

O texto narrativo do item 2.3.3 ainda registra `Al >= 30%`, porém a **Ata oficial da 44ª RPSRS, item 7.4, determina expressamente modificar o critério para `pHágua <= 5,5` e `Al >= 10%` na atualização da Tabela 2.2**. A própria Tabela 2.2 publicada usa o operador operacional `pHágua < 5,5`; a RAIZ preserva o operador da tabela corrente e o limiar de Al aprovado pela ata.

A decisão de reiniciar/incorporar o SPD continua **profissional**, porque a nota (3) manda considerar produtividade abaixo da média local, especialmente em estiagem; compactação restringindo crescimento radicular; disponibilidade de P em 10–20 cm abaixo do crítico; e o texto enfatiza conservação de solo e água. Assim:

- sem confirmação profissional explícita, retorna `BLOCKED_PROFESSIONAL_REVIEW`;
- após `agronomistConfirmedIncorporationDecision=true`, o motor pode calcular deterministicamente a dose pela média do SMP e emitir a aplicação incorporada;
- isso não transforma a decisão de incorporação em decisão de IA: o booleano de confirmação é o gate humano obrigatório.

### Solos de baixo poder tampão

O item 2.3.1 informa que, em solos principalmente arenosos, o índice SMP pode indicar dose muito pequena mesmo quando o pH requer correção. A publicação fornece duas equações de necessidade de calagem (NC, t/ha, PRNT 100%):

- pH 5,5: `NC = -0,653 + 0,480 × MO + 1,937 × Al`;
- pH 6,0: `NC = -0,516 + 0,805 × MO + 2,435 × Al`.

MO deve estar em `%` e Al trocável em `cmolc/dm³`. Resultado matemático não positivo não vira dose zero silenciosa: o caso é bloqueado para revisão de contexto.

### Ajuste por PRNT

As doses da Tabela 2.3 são para PRNT 100%. O ajuste algébrico para PRNT declarado/medido é separado da escolha comercial do produto: `dose_produto = dose_PRNT100 × 100 / PRNT%`.

## Divergência ainda preservada — lógica V/Al

A ata resolve as divergências `1/2 vs 1/4 SMP` e `Al 10% vs 30%`, mas não altera explicitamente a diferença entre:

- nota (1) da Tabela 2.2: **não aplicar** quando `V >= 65%` **e** `Al < 10%`;
- item 2.3.2: calagem preconizada quando `V < 65%` **e** `Al > 10%`.

Consequentemente, os quadrantes mistos e `Al = 10%` no perfil que depende dessa lógica continuam `BLOCKED_SOURCE_CONFLICT`. A RAIZ não converte silêncio editorial em regra.

## Calagem recente

O item 2.3.3 alerta que, em SPD consolidado com calagem recente, o SMP pode não detectar corretivo ainda não reagido; a publicação menciona que, em geral, são necessários cerca de três anos para dissolução completa. A RAIZ bloqueia reaplicação automática quando `yearsSinceLastLiming < 3`, direcionando o caso para revisão e evitando supercalagem.

## IDs de regra

- `LIMING-SOYBEAN-RS-SC-2025-CONVENTIONAL` — `READY_FOR_IMPLEMENTATION` apenas no domínio inequívoco; runtime fail-closed nos quadrantes V/Al ambíguos.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-ESTABLISHMENT` — `READY_FOR_IMPLEMENTATION` no contexto explicitamente correspondente.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED`:
  - sem restrições 10–20 cm: `READY_FOR_IMPLEMENTATION` apenas no domínio inequívoco e com ausência de restrições explicitamente confirmada;
  - com restrições 10–20 cm: `REQUIRES_AGRONOMIST_REVIEW`; após confirmação profissional de incorporação, a dose torna-se cálculo determinístico pela regra oficial.

## Regra de segurança

A ata oficial não é usada para “escolher a versão que parece melhor”; ela registra as alterações aprovadas pela própria reunião técnica e, por isso, resolve somente os pontos explicitamente alterados. Todo conflito não coberto pela ata permanece fail-closed. Histórico anterior não é reprocessado automaticamente.