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

### Contingência — Leaflet + OpenStreetMap

O defeito histórico de quadrantes pretos foi observado pelo usuário em qualquer tipo de tela, não apenas mobile. Isso reduz a probabilidade de ser somente um problema de responsividade/`invalidateSize` e torna inadequado depender da mesma camada aérea Esri no fallback.

Por isso, se Google não estiver configurado ou falhar em runtime, o mapa continua operacional com **Leaflet + OpenStreetMap**, sem Esri. O objetivo da contingência é disponibilidade e leitura espacial estável; imagem aérea permanece responsabilidade do Google Satellite no caminho principal.

Essa decisão também cobre o caso em que um servidor de imagem devolve um tile preto como PNG aparentemente válido (HTTP 200): nesse cenário, ter OSM abaixo não resolve porque o tile opaco continua cobrindo a base.

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

#### Cadeia de custódia do raster histórico

A partir da migration `037_ndvi_raster_custody.sql`, um snapshot novo não depende mais de regenerar a imagem no futuro. O fluxo de atualização faz, na mesma operação lógica:

1. consulta a série pela Statistical API;
2. para cada data selecionada ainda sem artefato arquivado, gera o PNG pela Process API com a mesma política de mosaico `leastCC`;
3. persiste o PNG em armazenamento durável/content-addressed **antes** de efetivar o snapshot auditável;
4. grava no PostgreSQL a chave do objeto, SHA-256, número de bytes, `bbox`, largura, altura, versão do algoritmo, política de mosaico e horário de arquivamento;
5. depois disso, a linha daquele `talhão + data + fonte` é preservada: refresh posterior não substitui estatística nem raster já arquivado;
6. `/api/fields/[id]/ndvi/map` lê exclusivamente o objeto arquivado e confere tamanho + SHA-256 antes de servi-lo. Não existe fallback silencioso para uma nova chamada ao Copernicus.

Snapshots antigos, criados antes dessa cadeia, continuam válidos como histórico estatístico, mas não podem ser apresentados como raster histórico imutável. A rota retorna `NDVI_RASTER_ARCHIVE_REQUIRED` até que o refresh promova aquela data para o novo contrato.

Em runtime hospedado, armazenamento local não é aceito para essa custódia; é necessário o mesmo provider S3 durável usado para fontes brutas (`STORAGE_PROVIDER=s3`). Uma falha de storage interrompe a criação do snapshot com raster — a RAIZ não marca uma imagem temporária como evidência preservada.

`provider_scene_id` pode continuar nulo quando a Statistical API não fornece um identificador inequívoco. A prova histórica passa a ser o próprio artefato binário arquivado + SHA-256 + metadados espaciais, sem inventar um scene-id que o provedor não entregou.

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

- Google Maps falha: fallback Leaflet + OpenStreetMap automático.
- A contingência não carrega Esri; portanto não reproduz deliberadamente a dependência associada ao defeito histórico dos quadrantes pretos.
- Raster NDVI arquivado falha em integridade/recuperação: talhão continua com contorno, mensagem explícita e nenhuma imagem é regenerada para fingir continuidade histórica.
- Snapshot legado sem artefato: solicita refresh antes de exibir mapa histórico.
- Ponto planejado: marcador/descrição deixam explícito que não é coordenada medida em campo.
- Fonte espacial real auditada: o mapa mantém essa proveniência mesmo sem `observed_position`.
- Sem geometria: talhão não é desenhado e o dashboard informa a quantidade ausente.

## Proteção de quota

A visualização espacial da carteira carrega no máximo 12 rasters NDVI por vez. A tela detalhada do Talhão 360° permanece disponível para os demais.

O refresh temporal considera no máximo 18 aquisições recentes. A Process API só é chamada para datas que ainda não possuem raster arquivado; repetir um refresh preserva os artefatos existentes e não os regenera. Isso limita consumo do Copernicus e mantém a cadeia histórica estável.

## Auditoria de homologação da custódia NDVI

A prova externa do #84 deve ser feita em ambiente autorizado, sem copiar credenciais para chat, issue ou log. O repositório contém um auditor somente leitura:

```bash
HOMOLOGATION_DATABASE_URL=<banco-autorizado> \
NDVI_AUDIT_TENANT_ID=<tenant-uuid> \
NDVI_AUDIT_FIELD_ID=<field-uuid> \
NDVI_AUDIT_DATE=2026-09-10 \
STORAGE_PROVIDER=s3 \
S3_ENDPOINT=<endpoint> \
S3_BUCKET=<bucket> \
S3_ACCESS_KEY=<access-key> \
S3_SECRET_KEY=<secret-key> \
npm run ndvi:audit-raster
```

`NDVI_AUDIT_DATE` é opcional; sem ela o auditor usa o snapshot Sentinel-2 mais recente do talhão. `NDVI_AUDIT_ACTOR_USER_ID` pode ser informado quando a política RLS do ambiente exigir identidade de usuário.

O comando `ndvi:audit-raster`:

- abre transação PostgreSQL `READ ONLY` e termina em `ROLLBACK`;
- confirma que as colunas da migration 037 existem;
- não escolhe tenant/talhão implicitamente;
- exige `STORAGE_PROVIDER=s3` para a prova de homologação;
- recupera o objeto já arquivado, sem chamar Copernicus;
- valida SHA-256 e quantidade de bytes contra o snapshot;
- valida presença de bbox/dimensões/algoritmo/mosaico;
- não imprime bbox, latitude ou longitude do cliente.

Somente um resultado `readyForImmutableRasterEvidence: true` junto com inspeção visual do raster alinhado ao talhão constitui a evidência técnica necessária para considerar o gate de custódia atendido. CI e Vercel `Ready` sozinhos não substituem essa prova.

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
   - mapa-base sem quadrantes pretos/vazios;
   - alternância Avaliação / Zonas NDVI / Tendência NDVI;
   - raster arquivado alinhado ao contorno;
   - hash/metadados do raster presentes no snapshot e rota servindo o mesmo objeto sem reconsulta ao Copernicus;
   - pontos GPS observados no local persistido;
   - pontos Cabeda de fonte auditada corretamente identificados como reais, não como planejados;
   - fallback OSM quando Google é propositalmente bloqueado.

## Fora de escopo desta integração

- Google Earth API antiga;
- cálculo de NDVI pelo Google;
- geocodificação para “corrigir” ponto de amostragem;
- transformar NDVI em produtividade sem evidência;
- inventar `accuracy_m` quando a fonte espacial não a fornece;
- alterar regra agronômica por causa do mapa-base.
