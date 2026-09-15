# Relatório de implementação — calagem da soja RS/SC 2025

## Objetivo

Atualizar a RAIZ para a publicação regional de soja 2025 sem transformar inconsistências editoriais da própria fonte em dose automática.

## Implementado

- novo domínio `src/domain/soybean-liming-rs-sc-2025.ts`;
- perfis separados para convencional, implantação de SPD e SPD consolidado;
- regras catalogadas com proveniência 2025;
- sistema convencional automático apenas quando pH/V/Al estão no domínio inequívoco;
- implantação de SPD com 1 SMP para pH 6,0, incorporado, no contexto explícito;
- SPD consolidado mantido sob revisão profissional;
- conflito `1/2 SMP` (Tabela 2.2) versus `1/4 SMP` (texto 2.3.3) preservado e bloqueado;
- conflito `Al >=10%` (Tabela 2.2) versus `Al >=30%` (texto 2.3.3) preservado e bloqueado na faixa divergente;
- decisão de reiniciar/incorporar SPD exige confirmação profissional e avaliação de produtividade, estiagem, compactação, P em profundidade e conservação;
- calagem recente (<3 anos informados) bloqueia reaplicação automática no SPD consolidado;
- equações oficiais de NC para solos de baixo poder tampão implementadas separadamente;
- ajuste matemático por PRNT implementado sem misturar escolha comercial de produto;
- testes de regressão adicionados ao `test:liming`, portanto entram no `test:handoff` e na CI já existente.

## Não implementado como automático

- escolha entre 1/2 e 1/4 SMP no SPD consolidado;
- escolha entre 10% e 30% de saturação por Al;
- decisão autônoma de reiniciar SPD;
- seleção de calcário calcítico/dolomítico;
- conversão em produto comercial sem PRNT declarado;
- qualquer reprocessamento retroativo de recomendações históricas.

## Critério de promoção

Esta feature só deve integrar `develop` após typecheck, suíte completa, validação das profundidades e build verdes. Depois da integração, deve gerar novo RC; não deve alterar diretamente o RC27.
