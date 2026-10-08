BEGIN;

ALTER TABLE planning_scenarios
  ADD COLUMN previous_crop_code text
  CHECK (previous_crop_code IS NULL OR previous_crop_code IN ('SOYBEAN','CORN','OTHER'));

COMMENT ON COLUMN planning_scenarios.previous_crop_code IS
  'Categoria estruturada da cultura imediatamente anterior ao primeiro cultivo planejado. NULL=UNKNOWN; nunca derivada automaticamente do texto livre previous_crop.';

COMMIT;
