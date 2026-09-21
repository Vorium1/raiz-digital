# RAIZ Digital — Golden Cases do Parecer Progressivo

**Status:** contrato funcional aprovado em 2026-09-21  
**Princípio:** o RAIZ usa toda evidência recebida, não exige todos os campos que é capaz de usar e nunca inventa o que não recebeu.

## Invariantes

1. O parecer global não é bloqueado pela ausência de uma dimensão opcional (biologia, irrigação, clima, histórico, NDVI etc.).
2. Cada cálculo/conclusão possui suficiência de evidência própria.
3. `UNKNOWN` nunca vira `NO`, zero, média padrão ou valor tabelado silenciosamente.
4. Evidência adicional aumenta a resolução; não muda retroativamente um fato laboratorial.
5. Quando uma regra oficial possui múltiplas alternativas ainda compatíveis com os dados disponíveis, o motor pode devolver **envelope/faixa oficial** em vez de escolher uma alternativa arbitrariamente.
6. Uma linha laboratorial localmente inválida pode ser excluída sem contaminar linhas válidas; falha estrutural do arquivo continua fail-closed.
7. IA redige somente achados autorizados; dose, classe e cálculo permanecem determinísticos.

---

## Caso 01 — Soja com dados básicos

### Entrada mínima do cenário
- laudo químico de solo com método/unidade identificáveis;
- pontos/amostras;
- cultura soja;
- meta produtiva quando informada.

### Esperado
- interpretar todos os parâmetros com regra compatível;
- calcular correção/adubação apenas onde a regra tiver os dados necessários;
- comparar pontos e mapear somente quando a estrutura espacial sustentar;
- emitir parecer mesmo sem BioAS, irrigação, clima, histórico ou NDVI.

### Reprova
- exigir irrigação/BioAS/histórico para emitir;
- tratar irrigação não informada como sequeiro;
- inventar método, profundidade ou dose.

---

## Caso 02 — Soja irrigada com alta resolução

### Evidências adicionais
- física do solo;
- BioAS/microbiologia;
- pivô e eventos de irrigação;
- eficiência medida;
- clima/ETo;
- estádio;
- histórico;
- NDVI.

### Esperado
- fertilidade segue o mesmo motor químico do Caso 01;
- ETo não vira ETc sem regra de Kc aplicável;
- lâmina bruta não vira líquida sem eficiência válida;
- balanço somente com evidências temporal/espacialmente alinhadas;
- microbiologia enriquece o diagnóstico sem crédito automático de N/P/K;
- NDVI é evidência vegetativa/espacial, não diagnóstico causal isolado.

### Reprova
`IRRIGATED => NO_WATER_STRESS`, `HIGH_NDVI => HIGH_YIELD`, organismo detectado => inoculação/crédito.

---

## Caso 03 — Milho de sequeiro em VT/R1 com solo + clima

### Entrada
- química + física;
- milho;
- estádio VT/R1;
- `RAINFED_DECLARED`;
- clima recente.

### Esperado
- zero irrigação suplementar pode ser usado porque foi explicitamente declarado sequeiro;
- água/temperatura são contextualizadas pelo estádio;
- risco hídrico/térmico não vira perda numérica de produtividade sem modelo homologado;
- chuva posterior atualiza o estado, preservando histórico.

### Reprova
- “20 mm de déficit = X sc/ha perdidas” sem modelo;
- clima alterar classe química;
- favorabilidade de doença virar fungicida automático.

---

## Caso 04 — Arroz irrigado

### Fonte principal regional
**SOSBAI. Arroz irrigado: recomendações técnicas da pesquisa para o Sul do Brasil. 2025.**  
Embrapa Infoteca: https://www.infoteca.cnptia.embrapa.br/handle/doc/1186259

A edição 2025 é direcionada a RS/SC e tem co-realização de Embrapa, Epagri, IRGA, UFPel e UFRGS.

### Regra de domínio
O arroz irrigado por inundação NÃO usa automaticamente o mesmo algoritmo hídrico de soja/milho.

Separar pelo menos:
- `FLOODED_RICE` — inundação/lâmina superficial;
- `SPRINKLER_RICE` — manejo por umidade/balanço pode ser aplicável quando homologado;
- `WATER_SYSTEM_UNKNOWN` — não escolher um dos dois.

### Cenário A — só sabemos “arroz irrigado”
Emitir parecer de solo/cultura e reconhecer sistema irrigado.  
Não inventar lâmina, início da irrigação, eficiência, perdas ou armazenamento.

### Cenário B — sistema de inundação + estádios/eventos
Pode integrar:
- estabelecimento/entrada de água;
- lâmina operacional observada;
- datas/estádios;
- drenagem quando informada;
- manejo de N relacionado ao sistema, somente conforme regra oficial aplicável.

### Envelope oficial
Quando uma tabela SOSBAI exigir uma classe adicional (por exemplo expectativa de resposta) e essa classe não estiver resolvida, **não escolher uma classe**. Se tecnicamente permitido pela própria estrutura da tabela:
- listar/calcular o conjunto ou faixa das alternativas oficiais ainda compatíveis;
- explicar qual informação reduz o envelope;
- manter o restante do parecer fechado.

### Reprova
- aplicar `TAW -> RAW -> irrigar` cegamente ao arroz inundado;
- copiar recomendação de cultura de sequeiro;
- escolher expectativa de resposta sem evidência;
- transformar “irrigado” em lâmina conhecida.

---

## Caso 05 — Trigo visando proteína/qualidade

### Fonte de controle
**Guarienti et al. Estratégias de adubação nitrogenada em trigo, efeitos na qualidade tecnológica. Embrapa Trigo, 2025.**  
https://www.infoteca.cnptia.embrapa.br/handle/doc/1178053

O estudo avaliou 12 ambientes PR/RS, cultivares contrastantes e estratégias de parcelamento de N. A aplicação de parte da dose tardiamente foi pouco efetiva, em geral, para elevar os indicadores de qualidade avaliados, e houve variação entre cultivares/ambientes.

### Regra RAIZ
“Quero mais proteína” NÃO autoriza automaticamente dose tardia de N.

Separar:
- recomendação de N para produtividade;
- estratégia de parcelamento;
- objetivo de qualidade/proteína;
- cultivar/classe tecnológica;
- estádio real;
- N já aplicado;
- condição da cultura/ambiente;
- regra local homologada para dose adicional, se existir.

### Pouca informação
Se o usuário apenas declara meta de proteína:
- registrar o objetivo;
- executar normalmente a recomendação base sustentada;
- informar que resposta de qualidade ao N tardio é variável e não autorizar dose adicional automática.

### Mais informação
Cultivar + estádio + N aplicado + condição/diagnóstico + regra homologada podem aumentar a resolução.

### Reprova
- “proteína baixa -> aplicar X kg N/ha” sem regra;
- tratar N tardio como garantia de proteína/glúten;
- misturar dose de produtividade e dose de qualidade sem rastreabilidade.

---

## Caso 06 — Carinata

### Evidência disponível
Literatura internacional mostra interação importante entre N e S em **Brassica carinata**, mas resultados de dose são contexto-específicos.

Referência de mecanismo/contexto:
Bhattarai, Kumar & Nleya. *Nitrogen and sulfur fertilizers effects on growth and yield of Brassica carinata in South Dakota*. Agronomy Journal. DOI: 10.1002/agj2.20501.

### Firewall regional
Dados de South Dakota, Florida, Índia ou outra região:
- podem sustentar que existe resposta/interação fisiológica a N/S;
- NÃO viram dose automática para RS/SC;
- NÃO autorizam copiar tabela de canola (`Brassica napus`) para carinata.

### Parecer com laudo de solo
Mesmo sem tabela local de dose de carinata, o RAIZ deve entregar:
- diagnóstico químico/físico do solo;
- condição de acidez e nutrientes interpretáveis pela metodologia aplicável;
- limitações observadas;
- contexto de que N/S merecem atenção na cultura;
- qualquer recomendação numérica somente se existir regra local/crop-specific homologada.

### Estado de regra
Enquanto não houver base regional homologada suficiente:
`CARINATA_LOCAL_RATE_NOT_HOMOLOGATED`

Isso é uma limitação de uma decisão específica, não falha do relatório.

### Reprova
- `CARINATA = CANOLA`;
- aplicar dose estrangeira como recomendação RS/SC;
- deixar de emitir todo o parecer porque uma dose específica não está homologada.

---

## Golden rule para tabelas parcialmente resolvidas

Quando dados disponíveis não identificam uma única linha oficial:

### Proibido
- selecionar valor “mais provável”;
- usar média das alternativas sem fundamento;
- exigir campo opcional como condição do relatório global.

### Permitido
- retornar interseção/consenso das regras compatíveis;
- retornar faixa/envelope de alternativas oficiais compatíveis;
- marcar a decisão específica como refinável;
- explicar de forma curta qual evidência reduziria o envelope.

Esse padrão deve ser reutilizável em irrigação, ZARC, fertilidade, produtividade e demais domínios.

---

## Critério final de homologação

- Caso 01 prova que o RAIZ funciona com pouco.
- Caso 02 prova que mais informação aumenta a resolução.
- Caso 03 prova integração solo × clima sem extrapolação.
- Caso 04 prova que sistemas hídricos diferentes não são confundidos.
- Caso 05 prova que objetivo de qualidade não vira dose automática.
- Caso 06 prova que evidência internacional não vira recomendação local por analogia.

**Frase de aceitação:** nenhuma informação opcional é requisito para o parecer global; cada nova evidência aumenta somente a resolução das conclusões que consegue sustentar.
