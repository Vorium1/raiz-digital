-- Estrutura pedida pelo diretor + Rafael Cabeda (Cabeda Pesquisa) para aumentar a assertividade da
-- recomendação: histórico da área (cultivar da próxima safra, se é área de abertura, produtividade
-- real em safras anteriores) e a auditoria de insumo recomendado × usado, com alerta de subaplicação.
-- Só estrutura (colunas/tabelas) -- nenhum coeficiente, faixa ou regra agronômica é definido aqui.
-- Os valores reais (extração/exportação por cultivar, regras de manejo físico) dependem de
-- homologação por agrônomo responsável, como todo o resto do motor determinístico.

ALTER TABLE crop_seasons
  ADD COLUMN IF NOT EXISTS next_cultivar text,
  ADD COLUMN IF NOT EXISTS technology_level text CHECK (technology_level IN ('BAIXO','MEDIO','ALTO')),
  ADD COLUMN IF NOT EXISTS soil_compaction_level text CHECK (soil_compaction_level IN ('NENHUM','BAIXO','MEDIO','ALTO')),
  ADD COLUMN IF NOT EXISTS livestock_trample_area_ha numeric(10,3),
  ADD COLUMN IF NOT EXISTS headland_area_ha numeric(10,3),
  ADD COLUMN IF NOT EXISTS is_first_year_area boolean,
  ADD COLUMN IF NOT EXISTS cultivation_years integer CHECK (cultivation_years IS NULL OR cultivation_years >= 0);

-- Produtividade real por safra anterior (distinto de crop_seasons.yield_goal, que é a META da
-- PRÓXIMA safra). Uma linha por safra/cultura já colhida, para comparar meta x realizado ao longo
-- do tempo -- e, no futuro, calibrar a confiabilidade da própria recomendação.
CREATE TABLE field_yield_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  field_id uuid NOT NULL,
  season_label text NOT NULL,
  crop text NOT NULL,
  cultivar text,
  yield_value numeric(12,3) NOT NULL,
  yield_unit text NOT NULL,
  source text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,field_id) REFERENCES fields(tenant_id,id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX field_yield_history_field_idx ON field_yield_history (tenant_id, field_id, created_at DESC);

ALTER TABLE field_yield_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_yield_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON field_yield_history USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON field_yield_history TO raiz_app;

-- Auditoria de insumo: o que o motor RECOMENDOU (gravado uma vez, imutável -- nunca é editado, só
-- superseded por um recálculo novo) versus o que foi de fato USADO (registrado depois, pelo
-- agrônomo/produtor). As duas tabelas nunca compartilham a mesma linha, de propósito: precisa dar
-- pra comparar os dois numeros de forma independente e rastreável, mesmo que divirjam.
CREATE TABLE input_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL,
  input_type text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  unit text NOT NULL,
  calculation_source text,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES analyses(tenant_id,id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX input_recommendations_analysis_idx ON input_recommendations (tenant_id, analysis_id, calculated_at DESC);

CREATE TABLE input_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  analysis_id uuid NOT NULL,
  input_type text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  unit text NOT NULL,
  applied_at date,
  applied_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,analysis_id) REFERENCES analyses(tenant_id,id),
  UNIQUE (tenant_id,id)
);
CREATE INDEX input_applications_analysis_idx ON input_applications (tenant_id, analysis_id, created_at DESC);

ALTER TABLE input_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE input_recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON input_recommendations USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON input_recommendations TO raiz_app;

ALTER TABLE input_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE input_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON input_applications USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON input_applications TO raiz_app;
