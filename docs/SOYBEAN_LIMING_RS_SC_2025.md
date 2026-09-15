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

No domínio em que os critérios positivos estão explicitamente atendidos — `pHágua < 5,5`, `V < 65%` e saturação por Al `> 10%` — a dose-base é `1 SMP para pHágua 6,0`, incorporada em 0–20 cm. A Tabela 2.3 reproduz as doses de SMP para PRNT 100%.

A nota (1) da Tabela 2.2 estabelece ainda um caso negativo explícito: **não aplicar** quando `V >= 65%` **e** `Al < 10%`.

Essas duas proposições não são inversas lógicas entre si. A nota negativa não autoriza automaticamente todo o complemento do seu domínio. Por isso, nos quadrantes mistos e em `Al = 10%`, a RAIZ não inventa uma regra: retorna `BLOCKED_SOURCE_DOMAIN`, com o blocker `V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE`, e mantém dose automática bloqueada.

Essa classificação substitui a antiga expressão `BLOCKED_SOURCE_CONFLICT` para C3. Não houve liberação de nenhum cenário novo; houve apenas correção semântica da razão do fail-closed.

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
- a combinação V/Al estiver em domínio explicitamente coberto pela fonte.

Quadrantes mistos e `Al = 10%` continuam fail-closed como **lacuna de domínio da fonte**, e não como conflito lógico entre a nota da tabela e o texto.

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

## C3 — domínio V/Al não explicitamente especificado

A leitura lógica auditada é:

- regra positiva do item 2.3.2: calagem preconizada quando `V < 65%` **e** `Al > 10%`, além dos demais requisitos;
- exceção negativa da nota (1) da Tabela 2.2: **não aplicar** quando `V >= 65%` **e** `Al < 10%`;
- a segunda proposição não é o inverso lógico da primeira;
- portanto a publicação não determina, de forma explícita, uma ação automática para os quadrantes mistos nem para `Al = 10%` nos perfis que dependem dessa lógica.

Política RAIZ versionada para C3:

- `V < 65%` e `Al > 10%`: pode seguir para `APPLY` quando todos os demais gates passam;
- `V >= 65%` e `Al < 10%`: `DO_NOT_APPLY` por regra negativa explícita;
- `V >= 65%` e `Al >= 10%`: `BLOCKED_SOURCE_DOMAIN`;
- `V < 65%` e `Al < 10%`: `BLOCKED_SOURCE_DOMAIN`;
- `Al = 10%` nos perfis C3: `BLOCKED_SOURCE_DOMAIN`;
- nenhum desses bloqueios gera dose, zero implícito ou preferência editorial.

O blocker operacional é `V_AL_COMBINATION_NOT_EXPLICITLY_AUTHORIZED_BY_SOURCE`. Esta é uma política de segurança da RAIZ para representar o silêncio do domínio da fonte; não é apresentada como recomendação agronômica adicional da publicação.

## Calagem recente

O item 2.3.3 alerta que, em SPD consolidado com calagem recente, o SMP pode não detectar corretivo ainda não reagido; a publicação menciona que, em geral, são necessários cerca de três anos para dissolução completa. A RAIZ bloqueia reaplicação automática quando `yearsSinceLastLiming < 3`, direcionando o caso para revisão e evitando supercalagem.

## IDs de regra

- `LIMING-SOYBEAN-RS-SC-2025-CONVENTIONAL` — `READY_FOR_IMPLEMENTATION` apenas no domínio explicitamente autorizado; runtime fail-closed nos quadrantes V/Al não especificados.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-ESTABLISHMENT` — `READY_FOR_IMPLEMENTATION` no contexto explicitamente correspondente.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED`:
  - sem restrições 10–20 cm: `READY_FOR_IMPLEMENTATION` apenas no domínio explicitamente coberto e com ausência de restrições confirmada;
  - com restrições 10–20 cm: `REQUIRES_AGRONOMIST_REVIEW`; após confirmação profissional de incorporação, a dose torna-se cálculo determinístico pela regra oficial.

## Regra de segurança

A ata oficial não é usada para “escolher a versão que parece melhor”; ela registra as alterações aprovadas pela própria reunião técnica e, por isso, resolve somente os pontos explicitamente alterados. Quando a publicação não define todo o domínio lógico de entrada, a RAIZ bloqueia o domínio não especificado em vez de completar a regra por inferência. Histórico anterior não é reprocessado automaticamente.