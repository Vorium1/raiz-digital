-- Groundwork de NDVI por satélite (item 4 do checklist do diretor, 2026-09-08): aprovado pelo diretor
-- ("não é exatamente preciso, mas já dá uma ajuda grande a entender as faixas de produtividade").
-- Fonte já escolhida antes desta migration (ver docs/PROJECT_STATE.md): Sentinel-2 via Copernicus Data
-- Space Ecosystem (tier gratuito), a mesma convenção do resto do projeto de preferir o provedor
-- gratuito/self-serve. Só estrutura: nenhuma leitura de satélite é inventada aqui, e a tabela só recebe
-- linha quando o provedor real (src/lib/satellite/copernicus-ndvi-provider.ts) devolver uma resposta de
-- verdade -- sem credencial configurada, a rota de importação recusa com erro claro, nunca grava dado
-- fictício (mesma regra de DATA_MODE=database usada em todo o resto da base).

CREATE TABLE field_ndvi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  field_id uuid NOT NULL,
  captured_at date NOT NULL,
  source text NOT NULL DEFAULT 'SENTINEL_2',
  provider_scene_id text,
  cloud_cover_pct numeric(5,2) CHECK (cloud_cover_pct IS NULL OR (cloud_cover_pct >= 0 AND cloud_cover_pct <= 100)),
  pixel_count integer NOT NULL CHECK (pixel_count > 0),
  mean_ndvi numeric(6,4) NOT NULL CHECK (mean_ndvi BETWEEN -1 AND 1),
  min_ndvi numeric(6,4) NOT NULL CHECK (min_ndvi BETWEEN -1 AND 1),
  max_ndvi numeric(6,4) NOT NULL CHECK (max_ndvi BETWEEN -1 AND 1),
  stddev_ndvi numeric(6,4) CHECK (stddev_ndvi IS NULL OR stddev_ndvi >= 0),
  -- Distribuição percentual de pixels por faixa de vigor (classificação determinística em
  -- src/domain/ndvi-engine.ts) -- guardada já calculada porque é derivada do mesmo histograma
  -- devolvido pelo provedor, não é reprocessada a partir de pixel bruto (a base não guarda raster).
  zone_breakdown_pct jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,field_id) REFERENCES fields(tenant_id,id),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,field_id,captured_at,source)
);

CREATE INDEX field_ndvi_snapshots_field_idx ON field_ndvi_snapshots (tenant_id, field_id, captured_at DESC);

ALTER TABLE field_ndvi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_ndvi_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON field_ndvi_snapshots USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON field_ndvi_snapshots TO raiz_app;
