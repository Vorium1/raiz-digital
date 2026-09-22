# Ledger de fontes — P e K da soja RS/SC 2025

## Fonte regional corrente

**Título:** Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027  
**Instituição/evento:** 44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / Universidade de Passo Fundo  
**Ano:** 2025  
**URL:** https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf  
**Localizador usado:** item 2.5.2, pp. 37–44; Tabelas 2.4, 2.5, 2.7 e 2.8.

### O que esta fonte sustenta na RAIZ

- classificação de P por classe de argila e K por CTC pH 7,0;
- manutenção da tabela de doses de P2O5/K2O para soja com rendimento de referência de 3 t/ha;
- incrementos de 15 kg P2O5/ha e 25 kg K2O/ha por tonelada acima da referência;
- estratégias de correção gradual e total, com contexto para uso e limitações em solos arenosos/baixa CTC;
- conversões explícitas Mehlich-3 -> Mehlich-1: `PM1 = PM3/[2,0-(0,02×argila)]` e `KM1 = KM3×0,83`;
- limites de posicionamento no sulco quando não existe afastamento seguro da semente;
- possibilidade publicada de ajuste aproximado de ±10 kg/ha por disponibilidade de formulação comercial.

### O que esta fonte NÃO autoriza automaticamente

- escolha automática entre correção total e gradual;
- adoção de correção total sem considerar o contexto econômico indicado no texto;
- conversão Mehlich-3 sem método analítico declarado e, para P, sem argila válida pelo método exigido;
- aumento ou redução livre da dose por uma IA usando a faixa ±10 kg/ha sem restrição comercial documentada;
- escolha automática de produto comercial;
- conversão da recomendação uniforme em prescrição à taxa variável.

## Linhagem histórica: CQFS-RS/SC 2016

**Título:** Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª edição  
**Instituição:** CQFS-RS/SC  
**Ano:** 2016  
**URL:** https://www.sbcs-nrs.org.br/docs/Manual_de_Calagem_e_Adubacao_para_os_Estados_do_RS_e_de_SC-2016.pdf  
**Localizador já homologado na RAIZ:** Tabela 6.1.2 p.106 e item 6.1.18 p.130.

A publicação regional 2025 atribui suas tabelas-base à CQFS-RS/SC 2016 e mantém os valores numéricos já presentes na RAIZ. Por isso a atualização de 2025 é tratada como **nova proveniência corrente com compatibilidade numérica**, não como reescrita retroativa do perfil de 2016.

## Decisão de versionamento

- histórico: `PK-SOJA-CQFS-2016` permanece disponível no catálogo;
- corrente para novas decisões RS/SC: `PK-SOJA-RS-SC-2025`;
- tabela histórica não é mutada;
- `SOJA_RS_SC_2025_DOSE_TABLE` mantém os valores e registra a fonte corrente;
- testes de regressão exigem paridade numérica entre as duas tabelas enquanto a fonte 2025 assim permanecer.

## Política de conflito e atualização futura

Se uma edição futura alterar classes, doses, rendimento de referência, conversões ou condições de manejo, ela deverá gerar nova regra/versionamento. A RAIZ não substituirá silenciosamente a regra 2025 e não recalculará recomendações históricas sem processo explícito de migração/homologação.
