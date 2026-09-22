# Cabeda — auditoria da geometria já persistida

Esta checagem existe para responder uma pergunta específica do piloto: **o banco de homologação está realmente usando o contorno e os pontos GPS reais importados de `amostrasreal`, ou ainda existe geometria histórica estimada?**

Ela não reabre nem publica as coordenadas privadas do cliente. O script `scripts/audit-cabeda-persisted-geometry.mjs` consulta somente o banco autorizado e devolve contagens, origem, SRID, coerência espacial, área e audit trail — nunca latitude/longitude.

## Execução em homologação

```bash
CABEDA_AUDIT_AREA=01 \
CABEDA_TENANT_ID=<tenant-autorizado> \
CABEDA_ACTOR_USER_ID=<usuario-autorizado> \
DATABASE_URL=<database-homologacao> \
DATABASE_SSL=require \
npm run cabeda:audit-geo
```

Repita com `CABEDA_AUDIT_AREA=02` para Área 02. Área 03 é recusada porque não existe pacote espacial real equivalente homologado.

O script abre `BEGIN TRANSACTION READ ONLY`, não possui caminho de escrita e termina em `ROLLBACK`.

## O que precisa passar

Para `readyForReliableSpatialEvidence=true`, todas as condições precisam ser satisfeitas:

- contorno presente, válido e em SRID 4326;
- área geodésica dentro da tolerância configurada em relação à área cadastral de referência;
- quantidade e códigos dos pontos exatamente compatíveis com o pacote auditado (8 na Área 01; 4 na Área 02);
- todos os pontos com posição persistida em SRID 4326;
- `gps_source` somente `SHAPEFILE_REAL_GPS_LONLAT` ou `SHAPEFILE_REAL_EPSG4326`;
- todos os pontos cobertos pelo contorno real ou no máximo 5 m fora, mesma tolerância conservadora usada na importação;
- audit trail real para todos os pontos, com `sourceLayer=amostrasreal`, SRID 4326 e sem reprojeção inventada;
- audit trail do contorno, com `sourceLayer=contorno` e origem espacial explicitada.

Qualquer falha retorna exit code `2` e blockers específicos. Geometria estimada/legada nunca é promovida silenciosamente a evidência real.

## O que esta auditoria NÃO libera

Passar nesta checagem significa apenas que a **proveniência geométrica persistida** é confiável o suficiente para entrar no gate espacial. Isso não autoriza automaticamente taxa variável, interpolação ou prescrição.

Continuam separados e obrigatórios os critérios do gate VRA: suporte amostral, profundidade/método, distribuição/qualidade dos pontos, política espacial homologada, revisão profissional e os demais controles técnicos já versionados na RAIZ.

## Uso no fechamento da issue #27 / RC

No ambiente de homologação, anexar ao aceite apenas a saída privacy-safe do comando (sem `DATABASE_URL`, IDs sensíveis ou coordenadas). Quando Área 01 passar, atualizar o checklist de homologação do piloto. Produção continua fora deste procedimento até GO explícito.