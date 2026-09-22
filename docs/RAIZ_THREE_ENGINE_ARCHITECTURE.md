# RAIZ Digital — Arquitetura dos três motores e expansão geográfica

## 1. Objetivo

A RAIZ deve separar três problemas diferentes:

1. **Motor de fertilidade/correção**
   - interpreta o laudo com método/protocolo;
   - classifica o solo;
   - calcula correção, construção e manutenção;
   - trabalha no horizonte entre análises;
   - nunca recebe clima como multiplicador de dose.

2. **Motor agroclimático/fitossanitário**
   - interpreta previsão/observação por cultura × região × estádio × janela;
   - transforma métricas meteorológicas em riscos físicos;
   - avalia favorabilidade climática de doenças;
   - nunca confirma infecção apenas por clima;
   - nunca autoriza fungicida automaticamente.

3. **Motor econômico/timing**
   - recebe necessidades prontas do motor de fertilidade;
   - recebe drivers de risco prontos do motor agroclimático;
   - compara correção total vs parcelamento tecnicamente válido, custo e fluxo de caixa;
   - pode sugerir simulações conservadoras/agressivas;
   - nunca altera dose agronômica ou meta produtiva automaticamente.

O contrato comum está em `src/domain/raiz-engine-orchestration.ts`.

---

## 2. Escopo geográfico

### Regra de resolução

Precedência obrigatória:

`polígono/subclima > município > UF > país`

Uma região com polígono não pode cair silenciosamente para a UF inteira.

A migration `040_technical_region_geoscope.sql` adiciona:
- país;
- UFs;
- municípios;
- região-pai;
- código de zona climática;
- polígono PostGIS MultiPolygon/WGS84;
- validade temporal.

O resolvedor está em `resolveTechnicalRegionsForLocation()`.

### Escopo operacional atual

- **RS e SC**: foco operacional corrente do motor de fertilidade.
- **PR**: já possui região técnica-base para permitir expansão, mas isso NÃO transfere automaticamente regras RS/SC.
- Demais UFs: entram pelo mesmo mecanismo quando houver fonte, perfil e validação adequados.

Os registros `BR-RS`, `BR-SC` e `BR-PR` são somente escopos administrativos-base. Eles não equivalem a subclimas e não homologam uma regra.

---

## 3. Tipos diferentes de regra climática

### Regra fisiológica da cultura

Pode ter abrangência nacional quando a fonte sustenta o mecanismo fisiológico.

Exemplos:
- milho e temperatura noturna;
- milho e temperatura do solo na emergência;
- milho e radiação no início reprodutivo.

Mesmo nesse caso, a previsão meteorológica usada como entrada continua localizada.

### Regra agroclimática regional

Efeito regional de:
- El Niño;
- La Niña;
- anomalia do Atlântico;
- distribuição de chuva;
- seca;
- excesso hídrico;
- geada;
- ondas de calor;
- radiação.

Essas regras devem usar escopo técnico explícito e nunca ser transferidas por proximidade.

### Regra fitossanitária

Deve combinar:
- cultura;
- doença;
- região/subclima;
- estádio;
- temperatura;
- umidade relativa;
- molhamento foliar;
- chuva;
- vento/radiação quando a fonte exigir;
- presença/alerta do patógeno;
- suscetibilidade do material.

Clima favorável ≠ infecção confirmada.

---

## 4. Variáveis agroclimáticas já modeladas

O domínio suporta:
- temperatura máxima e média diurna;
- temperatura média e mínima noturna;
- temperatura do solo;
- radiação solar/anomalia de radiação;
- precipitação;
- balanço hídrico;
- umidade relativa;
- molhamento foliar;
- VPD;
- vento;
- déficit hídrico;
- excesso de chuva;
- encharcamento;
- calor/frio;
- noites quentes/frias;
- geada;
- granizo;
- baixa radiação.

Novas variáveis só ganham interpretação agronômica quando existir regra homologada por cultura/região/estádio.

---

## 5. ENOS não é recomendação

`EL_NINO` e `LA_NINA` são drivers climáticos, não decisões agronômicas.

Fluxo correto:

`driver climático → sinal meteorológico regional → riscos físicos → resposta específica da cultura/estádio → drivers econômicos`

Exemplo:

`El Niño → maior risco regional de excesso hídrico → trigo em maturação → impacto adverso`

é uma cadeia diferente de:

`El Niño → determinada distribuição de chuva → milho em fase vegetativa → resposta específica`.

Nenhuma etapa pode ser pulada.

---

## 6. Expansão de culturas

Uma nova cultura não herda automaticamente:
- limiar térmico;
- resposta à radiação;
- resposta ao déficit/excesso de água;
- perfil de doença;
- janela ZARC;
- dose nutricional;
- perfil de outra cultura do mesmo grupo.

HF, fruticultura e culturas perenes usam o mesmo contrato, mas com perfis próprios.

---

## 7. Expansão para nova região/UF

Checklist mínimo:

1. cadastrar região técnica administrativa;
2. cadastrar sub-regiões/polígonos quando necessário;
3. vincular fonte técnica ao escopo;
4. homologar perfis de cultura;
5. homologar métricas climáticas por estádio;
6. homologar perfis de favorabilidade de doenças;
7. integrar ZARC/boletins oficiais para a região;
8. validar testes de não-vazamento para regiões vizinhas;
9. somente então liberar o motor econômico a usar clima naquela região.

---

## 8. Fontes públicas estruturantes

- MAPA — ZARC: município × cultura × tipo de solo × ciclo de cultivar.
  https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/zoneamento-agricola

- MAPA — Plantio Certo / consulta ZARC.
  https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/plantio-certo

- INMET — boletins agroclimatológicos e previsão trimestral.
  https://portal.inmet.gov.br/

- Embrapa Milho e Sorgo — relações da cultura do milho com água, temperatura e radiação.
  https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/cultivos/milho/pre-producao/caracteristicas-da-especie-e-relacoes-com-o-ambiente/relacoes-com-o-clima

Perfis quantitativos devem citar a fonte específica usada na homologação, e não apenas estas páginas estruturantes.
