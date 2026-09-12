# Cabeda — georreferenciamento real

Data: 2026-09-12  
Escopo: Área 01 e Área 02  
Status: **fonte real recebida; atualização do banco ainda bloqueada por CRS não declarado**

## Fonte recebida

Foram recebidos dois pacotes reais do Cabeda:

- `CABEDA 01.rar` → Área 01
- `CABEDA 02.rar` → Área 02

Cada pacote contém os conjuntos shapefile:

- `contorno` (`.shp/.shx/.dbf`)
- `amostras`
- `amostrasreal`
- `grade`
- `subamostras`
- `subamostrasreal`

Nenhum dos dois pacotes contém arquivo `.prj`. Portanto o sistema de referência de coordenadas (CRS) **não está declarado no material recebido**.

## Regra de fonte de verdade

Para posição efetivamente executada em campo:

`amostrasreal` > `amostras`

`amostras` é tratado como planejamento quando houver divergência. `contorno` é a fonte preferida para o limite do talhão, depois de o CRS ser confirmado.

A geometria artificial hoje criada por `scripts/import-cabeda-solo-2026.mjs` (retângulo e pontos estimados perto do centro aproximado de Água Santa/RS) é **fallback legado de demonstração**, nunca evidência de campo.

- Área 01: substituir somente após validar o pacote CABEDA 01.
- Área 02: substituir somente após validar o pacote CABEDA 02.
- Área 03: continua explicitamente estimada até existir fonte espacial real própria.

## Por que não gravar agora

Sem `.prj`, interpretar X/Y como latitude/longitude ou escolher uma zona UTM por palpite pode deslocar o talhão quilômetros e transformar um dado real em uma geometria falsa.

A atualização deve permanecer fail-closed até uma destas condições:

1. o fornecedor/consultor confirmar o CRS usado na exportação; ou
2. o CRS ser identificado de forma inequívoca por valores, localização e conferência visual contra referência conhecida, documentando a transformação.

Nenhum `field.boundary` e nenhum `sample_points.position` deve ser alterado apenas para melhorar a aparência do mapa.

## Aceite obrigatório antes de atualizar o banco

Para cada área:

1. identificar e registrar CRS de origem;
2. converter para EPSG:4326;
3. confirmar quantidade de pontos de `amostrasreal` contra os pontos do laudo;
4. usar identificador do DBF para vincular ponto sempre que disponível — nunca depender só da ordem do array;
5. confirmar que todos os pontos ficam dentro ou tecnicamente coerentes com o `contorno`;
6. confirmar ausência de latitude/longitude invertida;
7. calcular área geodésica do polígono e comparar com a área cadastrada;
8. verificar nenhum ponto duplicado após transformação;
9. manter vínculo SQC ↔ ponto ↔ laudo intacto;
10. registrar origem espacial e auditoria da substituição.

Referências cadastrais atuais:

- Área 01: 4,32 ha; 8 pontos de laboratório.
- Área 02: 2,13 ha; 4 pontos de laboratório.

A diferença de área não deve ser “corrigida” automaticamente. Se a área geométrica divergir materialmente da área cadastral, a RAIZ deve mostrar a divergência para revisão.

## Resultado esperado na RAIZ

Depois da validação, o Talhão 360° deve conseguir provar ao cliente:

- limite real do talhão;
- posição real de cada amostra;
- código da amostra e laudo vinculados ao ponto;
- parâmetro e classificação no ponto;
- data/origem da geometria;
- distinção clara entre planejado (`amostras`) e executado (`amostrasreal`).

Isso é requisito comercial: um mapa bonito com coordenada estimada reduz confiança. Um mapa rastreável, com origem e qualidade espacial explícitas, aumenta o valor percebido e permite futuramente cruzamentos espaciais legítimos com camadas satelitais — sem afirmar coincidência antes de existir geometria compatível.

## O que ainda não está autorizado

- não alterar produção;
- não assumir EPSG:4326;
- não assumir UTM/zone sem confirmação;
- não usar Área 01/02 como base para inventar Área 03;
- não afirmar correlação espacial solo × NDVI antes de existirem geometrias espaciais compatíveis e método validado.
