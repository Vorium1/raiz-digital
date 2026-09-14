BEGIN;

-- Contexto específico do módulo de nitrogênio. Mantemos estes campos fora de
-- crop_seasons para não transformar atributos condicionais de uma cultura em
-- colunas genéricas obrigatórias para todas as safras.
CREATE TABLE nitrogen_recommendation_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  crop_season_id uuid NOT NULL,

  corn_preceding_class text CHECK (corn_preceding_class IN ('LEGUME_OR_FALLOW','GRASS','GRASS_SUCCESSION')),
  planned_population_plants_per_ha integer CHECK (planned_population_plants_per_ha IS NULL OR planned_population_plants_per_ha > 0),
  residue_class text CHECK (residue_class IN ('LEGUME','GRASS','UNKNOWN')),
  residue_biomass_ton_per_ha numeric(12,3) CHECK (residue_biomass_ton_per_ha IS NULL OR residue_biomass_ton_per_ha >= 0),

  wheat_preceding_crop text CHECK (wheat_preceding_crop IN ('SOY','CORN')),
  late_quality_n_requested boolean NOT NULL DEFAULT false,

  pasture_type text CHECK (pasture_type IN ('ANNUAL_GRASS','PERENNIAL_GRASS','LEGUME')),
  target_dry_matter_ton_per_ha numeric(12,3) CHECK (target_dry_matter_ton_per_ha IS NULL OR target_dry_matter_ton_per_ha > 0),
  preceding_legume boolean,
  effective_legume_inoculation boolean,
  proven_legume_inoculation_failure boolean,
  number_of_uses integer CHECK (number_of_uses IS NULL OR number_of_uses >= 0),

  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id,crop_season_id) REFERENCES crop_seasons(tenant_id,id) ON DELETE CASCADE,
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,crop_season_id),
  CHECK (NOT (effective_legume_inoculation IS TRUE AND proven_legume_inoculation_failure IS TRUE))
);

CREATE INDEX nitrogen_recommendation_contexts_season_idx
  ON nitrogen_recommendation_contexts (tenant_id, crop_season_id);

ALTER TABLE nitrogen_recommendation_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nitrogen_recommendation_contexts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nitrogen_recommendation_contexts
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON nitrogen_recommendation_contexts TO raiz_app;

COMMIT;
