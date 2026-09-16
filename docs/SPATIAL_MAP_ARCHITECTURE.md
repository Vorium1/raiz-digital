# RAIZ Digital — arquitetura espacial do mapa

## Objetivo

Separar responsabilidades para que troca de mapa-base não altere a evidência agronômica:

1. **Google Maps Platform / Satellite**: mapa-base visual, navegação e contexto do terreno.
2. **Copernicus Data Space / Sentinel-2 L2A**: raster NDVI real e série temporal.
3. **PostgreSQL + PostGIS**: contorno oficial dos talhões, pontos planejados, pontos GPS observados e proveniência espacial.
4. **Motor RAIZ**: classes de NDVI, interpretação agronômica, gates e auditoria. Google nunca calcula dose, classe agronômica ou coordenada oficial.

A aplicação possui uma fachada única de mapa. O provedor-base pode ser trocado sem mudar o contrato de `boundary`, `points` e `imageOverlay`.

## Provedores

### Preferencial — Google Satellite

Configuração de browser:

```env
NEXT_PUBLIC_RAIZ_MAP_PROVIDER=google
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

A chave de Maps JavaScript API é uma credencial de browser e, portanto, aparece no frontend por desenho da plataforma. Ela deve ser criada exclusivamente para a RAIZ e protegida no Google Cloud Console por:

- **Application restriction: HTTP referrers**;
- domínio de produção e previews autorizados;
- **API restriction: Maps JavaScript API**;
- sem reutilização da chave em backend ou outros serviços.

A RAIZ usa a Maps JavaScript API oficial. Não utiliza URL não documentada de tile do Google e não faz scraping/cache da imagem-base.

Documentação oficial:

- https://developers.google.com/maps/documentation/javascript/load-maps-js-api
- https://developers.google.com/maps/documentation/javascript/maptypes
- https://developers.google.com/maps/documentation/javascript/reference/image-overlay
- https://developers.google.com/maps/documentation/javascript/datalayer

### Contingência — Leaflet

Se Google não estiver configurado ou falhar em runtime, o mapa continua operacional com Leaflet. A pilha de contingência usa OpenStreetMap por baixo da imagem aérea Esri e rótulos CARTO. Assim, falha pontual de tile de imagem aérea não deixa o usuário diante de quadrantes pretos.

A contingência não muda:

- geometria PostGIS;
- raster NDVI;
- coordenadas dos pontos;
- precisão registrada;
- resultados laboratoriais.

## NDVI: três conceitos separados

O dashboard não mistura mais avaliação, vigor espacial e tendência temporal.

### Avaliação

Cor do talhão = estado do fluxo agronômico (`sem análise`, `em andamento`, `não interpretável`, `aprovado`).

### Zonas NDVI

O backend gera PNG georreferenciado pelo Copernicus Process API usando o limite real do talhão. O frontend posiciona esse PNG pelo `bbox` retornado e mostra cinco classes determinísticas:

- `< 0,20`: sem vegetação;
- `0,20–0,40`: vigor baixo;
- `0,40–0,60`: vigor moderado;
- `0,60–0,80`: vigor alto;
- `>= 0,80`: vigor muito alto.

Essas classes são **zonas de vigor NDVI**, não “produtividade”. Para afirmar produtividade é necessário mapa de colheita ou metodologia multitemporal validada para esse fim.

### Tendência NDVI

Mostra mudança temporal calculada sobre a série do próprio talhão. Não colore o interior por pixel e não atribui causa agronômica.

## Pontos, proveniência e precisão

A posição renderizada continua sendo a posição efetiva devolvida pela camada PostGIS, mas a interface distingue três estados de proveniência:

1. **GPS observado em campo** — existe `sample_points.observed_position`; esta captura prevalece sobre a posição-base.
2. **Coordenada real importada e auditada** — a posição real está preservada em `sample_points.position` e `gps_source` identifica uma fonte espacial previamente auditada, como `SHAPEFILE_REAL_GPS_LONLAT` ou `SHAPEFILE_REAL_EPSG4326`.
3. **Posição planejada** — não há `observed_position` nem uma fonte real auditada; a coordenada não pode ser apresentada como medição de campo.

Essa distinção é necessária porque os datasets Cabeda auditados preservam as coordenadas reais do shapefile em `position`, acompanhadas do `gps_source` e audit trail. Classificá-los como “planejados” apenas por não possuírem `observed_position` destruiria a própria proveniência que queremos mostrar.

Casas decimais adicionais não são tratadas como “precisão”. Quando existe medição de acurácia do dispositivo, a precisão operacional continua sendo `accuracy_m`; a origem é `gps_source`. Uma coordenada importada pode ter boa proveniência espacial mesmo sem `accuracy_m`, mas isso não autoriza inventar uma incerteza em metros que a fonte não forneceu.

Para Cabeda e qualquer importação espacial real, a aceitação final depende da auditoria persistida de PostGIS. Visualmente “parecer no lugar” não substitui prova de proveniência.

## Comportamento em falhas

- Google Maps falha: fallback Leaflet automático.
- Tile Esri falha no fallback: OSM permanece abaixo, evitando quadrante vazio/preto quando a falha for ausência/transparência do tile.
- Raster NDVI falha: talhão continua com contorno, mensagem explícita e nenhuma classe inventada.
- Ponto planejado: marcador/descrição deixam explícito que não é coordenada medida em campo.
- Fonte espacial real auditada: o mapa mantém essa proveniência mesmo sem `observed_position`.
- Sem geometria: talhão não é desenhado e o dashboard informa a quantidade ausente.

## Proteção de quota

A visualização espacial da carteira carrega no máximo 12 rasters NDVI por vez. A tela detalhada do Talhão 360° permanece disponível para os demais. Isso evita transformar a abertura do dashboard em uma explosão de chamadas ao Copernicus.

## Checklist para vincular o Google Maps

1. Criar/selecionar projeto no Google Cloud.
2. Ativar **Maps JavaScript API**.
3. Garantir billing da conta/projeto conforme exigido pelo Google Maps Platform.
4. Criar chave de browser exclusiva da RAIZ.
5. Restringir por HTTP referrer aos domínios autorizados.
6. Restringir a chave à Maps JavaScript API.
7. Configurar no ambiente Vercel:
   - `NEXT_PUBLIC_RAIZ_MAP_PROVIDER=google`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=<chave>`
8. Fazer novo deploy, pois variáveis `NEXT_PUBLIC_*` são incorporadas ao bundle do frontend.
9. Validar em mobile e desktop:
   - mosaico sem quadrantes vazios;
   - alternância Avaliação / Zonas NDVI / Tendência NDVI;
   - raster alinhado ao contorno;
   - pontos GPS observados no local persistido;
   - pontos Cabeda de fonte auditada corretamente identificados como reais, não como planejados;
   - fallback quando Google é propositalmente bloqueado.

## Fora de escopo desta integração

- Google Earth API antiga;
- cálculo de NDVI pelo Google;
- geocodificação para “corrigir” ponto de amostragem;
- transformar NDVI em produtividade sem evidência;
- inventar `accuracy_m` quando a fonte espacial não a fornece;
- alterar regra agronômica por causa do mapa-base.
