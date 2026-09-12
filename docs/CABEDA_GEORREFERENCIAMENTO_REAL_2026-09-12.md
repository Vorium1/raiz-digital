# Cabeda — georreferenciamento real

Data: 2026-09-12  
Escopo: Área 01 e Área 02  
Status: **geometria real auditada; pronta para aplicação controlada em DEV, sem alterar produção**

## Fonte recebida

Foram recebidos e auditados os dois pacotes reais do Cabeda:

- `CABEDA 01.rar` → Área 01
- `CABEDA 02.rar` → Área 02

Cada pacote contém conjuntos shapefile para:

- `contorno`
- `amostras`
- `amostrasreal`
- `grade`
- `subamostras`
- `subamostrasreal`

Os pacotes não contêm arquivo `.prj`. Portanto o datum/CRS original não veio documentalmente declarado pelo exportador.

## O que a auditoria dos arquivos reais confirmou

A inspeção direta de SHP + DBF confirmou que os layers espaciais úteis estão em **coordenadas geográficas longitude/latitude decimal**, coerentes com GPS e com a localização do imóvel em Água Santa/RS. Os próprios atributos `grade_gps`/`marca_gps` repetem os pares longitude/latitude existentes nas geometrias.

Isso permite afirmar com segurança a **forma das coordenadas** e a localização geográfica. Não permite afirmar, sem `.prj` ou metadado do equipamento/exportador, qual datum original foi declarado no momento da coleta/exportação.

Por governança, a RAIZ registra então:

- origem: `GEOGRAPHIC_LONLAT_GPS_DATUM_UNDECLARED`;
- datum de origem: `UNDECLARED_IN_SOURCE`;
- SRID operacional no PostGIS: `4326`;
- reprojeção numérica aplicada: `false`.

Ou seja: a plataforma preserva os pares longitude/latitude reais recebidos e deixa a incerteza documental do datum explícita no audit trail, em vez de inventar um EPSG de origem.

## Regra de fonte de verdade

Para posição efetivamente executada em campo:

`amostrasreal` > `amostras`

A auditoria provou que essa distinção é material: os pontos planejados e realizados não coincidem.

- Área 01: deslocamento planejado → realizado médio de aproximadamente **41,1 m**, variando de **28,8 m a 68,0 m**.
- Área 02: deslocamento planejado → realizado médio de aproximadamente **41,4 m**, variando de **29,6 m a 63,2 m**.

Portanto usar `amostras` como se fosse a posição executada introduziria erro espacial relevante. `amostrasreal` é a fonte correta para os pontos efetivamente coletados.

`contorno` é a fonte de verdade para o limite espacial do talhão após as validações abaixo.

A geometria artificial criada no importador legado (`scripts/import-cabeda-solo-2026.mjs`) — retângulo e pontos estimados perto do centro aproximado de Água Santa/RS — continua marcada como fallback histórico e nunca deve ser apresentada como posição real de campo.

## Resultado quantitativo da auditoria

### Área 01

- área cadastral: **4,32 ha**;
- área geodésica calculada a partir do contorno real: **4,289 ha**;
- divergência: aproximadamente **0,72%**;
- pontos reais encontrados em `amostrasreal`: **8**;
- códigos/rótulos: 1 a 8, únicos;
- pontos reais dentro do contorno: **8/8**;
- perímetro geodésico aproximado: **964,9 m**.

### Área 02

- área cadastral: **2,13 ha**;
- área geodésica calculada a partir do contorno real: **2,114 ha**;
- divergência: aproximadamente **0,77%**;
- pontos reais encontrados em `amostrasreal`: **4**;
- códigos/rótulos: 1 a 4, únicos;
- pontos reais dentro do contorno: **4/4**;
- perímetro geodésico aproximado: **604,1 m**.

As duas divergências de área estão abaixo do limite operacional conservador de 5% configurado no importador real. Nenhuma área cadastral deve ser alterada automaticamente: o contorno espacial e a área administrativa continuam sendo evidências distintas.

## Layers vazios no material recebido

Nos dois pacotes auditados, os layers `grade`, `subamostras` e `subamostrasreal` não contêm features utilizáveis. Isso não é tratado como erro de importação dos pontos reais, porque `contorno`, `amostras` e `amostrasreal` estão presentes e coerentes.

A RAIZ não deve inventar grade/subamostras para preencher esses layers.

## Validações fechadas antes de gravar

Para Área 01 e Área 02 foram confirmados:

1. coordenadas no formato geográfico lon/lat;
2. localização coerente com Água Santa/RS;
3. quantidade de pontos reais compatível com os laudos importados;
4. identificadores dos pontos únicos e sequenciais;
5. todos os pontos de `amostrasreal` espacialmente coerentes com o contorno;
6. ausência de eixo latitude/longitude invertido;
7. área geodésica do polígono compatível com a área cadastral;
8. ausência de pontos duplicados;
9. diferença mensurável entre ponto planejado e ponto realizado;
10. nenhum valor laboratorial precisa ser alterado por esta correção espacial.

## Implementação segura

`scripts/import-cabeda-real-geometry.mjs` aceita dois modos explícitos:

- `CABEDA_SOURCE_CRS_CONFIRMED=EPSG:4326` — somente quando houver confirmação documental do datum;
- `CABEDA_SOURCE_CRS_CONFIRMED=GEOGRAPHIC_LONLAT_GPS` + `CABEDA_SOURCE_DATUM_UNDECLARED_ACK=true` — modo correto para os dois pacotes auditados hoje.

No segundo modo não ocorre transformação numérica. O script:

- valida polígono e janela geográfica;
- exige 8 pontos na Área 01 e 4 na Área 02;
- exige correspondência de código com os pontos já existentes no banco;
- exige pontos dentro do contorno ou no máximo 5 m de tolerância;
- compara área geodésica com a área cadastral;
- opera em DRY-RUN por padrão;
- grava somente com `CABEDA_GEO_APPLY=true`;
- registra before/after e origem espacial em `audit_events`;
- marca o ponto como `SHAPEFILE_REAL_GPS_LONLAT` quando o datum de origem permanece não declarado.

## Privacidade e repositório público

As coordenadas exatas do imóvel e dos pontos de coleta são dado operacional de cliente. Como o repositório atual é público, **os GeoJSON reais e as coordenadas exatas não devem ser commitados no GitHub**.

O repositório contém apenas:

- regras de validação;
- estatísticas não reversíveis suficientes para auditoria técnica;
- documentação do método;
- script genérico de importação.

Os arquivos GeoJSON convertidos permanecem fora do repositório e devem ser usados apenas na execução controlada contra o banco autorizado.

## Resultado esperado na RAIZ

Depois da aplicação em DEV e validação visual, o Talhão 360° poderá provar ao cliente:

- limite real do talhão;
- posição real de cada amostra;
- código da amostra e laudo vinculados ao ponto;
- parâmetro e classificação no ponto;
- data/origem da geometria;
- distinção clara entre planejado (`amostras`) e executado (`amostrasreal`);
- rastreabilidade do datum não declarado no arquivo-fonte.

Isso habilita, em etapa posterior, cruzamentos espaciais legítimos com NDVI/satélite. Correlação ou causalidade solo × vigor não deve ser afirmada apenas porque duas camadas se sobrepõem.

## Área 03

Área 03 continua explicitamente estimada. Não existe pacote espacial equivalente recebido para essa área e nenhuma geometria deve ser inferida a partir das Áreas 01/02.

## Próxima ação operacional

1. rodar Área 01 em DEV em modo DRY-RUN com os GeoJSON privados convertidos;
2. revisar a tabela de validação;
3. aplicar em DEV;
4. repetir para Área 02;
5. validar os mapas e vínculos SQC ↔ ponto ↔ laudo na aplicação;
6. só depois preparar uma migração controlada para produção.

**Produção/Neon permanece sem alteração até esse aceite.**
