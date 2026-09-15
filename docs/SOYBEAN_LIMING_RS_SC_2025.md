# Calagem da soja RS/SC — perfil 2025

## Fonte primária

**Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027** — 44ª Reunião de Pesquisa de Soja da Região Sul, Passo Fundo, 2025.

Arquivo oficial: `https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf`

Locais usados: item 2.3, pp. 22–29; especialmente Tabela 2.2 (p. 24), item 2.3.1 (p. 25), itens 2.3.2–2.3.4 (pp. 25–28) e Tabela 2.3 (p. 28).

## O que é inequívoco e foi implementado

### Sistema convencional

No domínio em que os critérios são simultaneamente inequívocos — `pHágua < 5,5`, `V < 65%` e saturação por Al `> 10%` — a dose-base é `1 SMP para pHágua 6,0`, incorporada em 0–20 cm. A Tabela 2.3 reproduz as doses de SMP para PRNT 100%.

A edição 2025 traz uma diferença lógica entre a nota (1) da Tabela 2.2 e a redação do item 2.3.2. A nota diz para **não aplicar** quando `V >= 65%` **e** `Al < 10%`; o texto afirma que a calagem é preconizada quando `V < 65%` **e** `Al > 10%`. Nos quadrantes mistos e em `Al = 10%`, a RAIZ não escolhe silenciosamente uma interpretação: retorna conflito de fonte e bloqueia dose automática.

### Implantação do sistema plantio direto

A Tabela 2.2 é direta: amostragem 0–20 cm, decisão `pHágua < 5,5`, `1 SMP para pHágua 6,0`, com incorporação. O motor só atua quando o sistema informado corresponde explicitamente a esse contexto.

### Solos de baixo poder tampão

O item 2.3.1 informa que, em solos principalmente arenosos, o índice SMP pode indicar dose muito pequena mesmo quando o pH requer correção. A publicação fornece duas equações de necessidade de calagem (NC, t/ha, PRNT 100%):

- pH 5,5: `NC = -0,653 + 0,480 × MO + 1,937 × Al`;
- pH 6,0: `NC = -0,516 + 0,805 × MO + 2,435 × Al`.

MO deve estar em `%` e Al trocável em `cmolc/dm³`. Resultado matemático não positivo não vira dose zero silenciosa: o caso é bloqueado para revisão de contexto.

### Ajuste por PRNT

As doses da Tabela 2.3 são para PRNT 100%. O ajuste algébrico para PRNT declarado/medido é separado da escolha comercial do produto: `dose_produto = dose_PRNT100 × 100 / PRNT%`.

## Conflito interno material — plantio direto consolidado

A edição 2025 contém duas divergências internas que impedem transformar todo o perfil consolidado em regra automática única.

### Sem restrições na camada 10–20 cm

- **Tabela 2.2, p. 24:** `1/2 SMP para pHágua 6,0`, aplicação superficial, limitada a 5 t/ha PRNT 100%.
- **Texto do item 2.3.3, p. 26:** `1/4` da dose necessária para elevar o pH a 6,0.

A RAIZ calcula apenas os dois candidatos para auditoria e retorna `BLOCKED_SOURCE_CONFLICT`. Não escolhe 1/2 ou 1/4 por preferência editorial.

### Com restrições na camada 10–20 cm

- **Tabela 2.2, p. 24:** decisão com `pHágua < 5,5` e saturação por Al `>= 10%`.
- **Texto do item 2.3.3, p. 26:** menciona saturação por Al `>= 30%`.

Entre 10% e 30% de Al a automação é bloqueada por conflito. Em `Al >= 30%`, os dois trechos concordam quanto à presença da restrição, mas a decisão de reiniciar/incorporar o SPD continua exigindo engenheiro agrônomo. A própria publicação exige considerar produtividade abaixo da média local (especialmente em estiagem), compactação, P em 10–20 cm e conservação do solo/água.

Quando a incorporação é profissionalmente confirmada, o candidato de dose usa `1 SMP para pH 6,0` com o **SMP médio das camadas 0–10 e 10–20 cm**, como informa a nota (7) da Tabela 2.2. O perfil permanece não automático no catálogo.

## Calagem recente

O item 2.3.3 alerta que, em SPD consolidado com calagem recente, o SMP pode não detectar corretivo ainda não reagido; a publicação menciona que, em geral, são necessários cerca de três anos para dissolução completa. A RAIZ bloqueia reaplicação automática quando `yearsSinceLastLiming < 3`, direcionando o caso para revisão e evitando supercalagem.

## IDs de regra

- `LIMING-SOYBEAN-RS-SC-2025-CONVENTIONAL` — `READY_FOR_IMPLEMENTATION` apenas no domínio inequívoco; runtime fail-closed nos quadrantes V/Al ambíguos.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-ESTABLISHMENT` — `READY_FOR_IMPLEMENTATION` no contexto explicitamente correspondente.
- `LIMING-SOYBEAN-RS-SC-2025-NO-TILL-CONSOLIDATED` — `REQUIRES_AGRONOMIST_REVIEW` por conflito interno da própria fonte e por decisão de incorporação/conservação.

## Regra de segurança

A publicação de 2025 é fonte primária corrente para soja no RS/SC, mas fonte primária não significa automaticamente que toda passagem é internamente coerente. Quando tabela e texto da mesma edição divergem, a RAIZ preserva ambos no ledger, expõe a divergência e falha fechado até existir errata, esclarecimento oficial ou decisão profissional explicitamente registrada.
