BEGIN;

ALTER TABLE planning_scenarios
  ADD COLUMN years_since_last_liming numeric NULL
    CHECK (years_since_last_liming IS NULL OR years_since_last_liming >= 0),
  ADD COLUMN liming_yield_below_local_average_drought boolean NULL,
  ADD COLUMN liming_compaction_restricts_root_growth boolean NULL,
  ADD COLUMN liming_phosphorus_10_20_below_critical boolean NULL,
  ADD COLUMN liming_agronomist_confirmed_incorporation boolean NULL;

COMMENT ON COLUMN planning_scenarios.years_since_last_liming IS
  'Anos declarados desde a última calagem. NULL=UNKNOWN; nunca extraído do texto livre.';
COMMENT ON COLUMN planning_scenarios.liming_yield_below_local_average_drought IS
  'Avaliação explícita para o gate 10–20 cm; NULL=UNKNOWN.';
COMMENT ON COLUMN planning_scenarios.liming_compaction_restricts_root_growth IS
  'Avaliação explícita de compactação/restrição radicular; NULL=UNKNOWN.';
COMMENT ON COLUMN planning_scenarios.liming_phosphorus_10_20_below_critical IS
  'Avaliação explícita de P 10–20 cm abaixo do crítico; NULL=UNKNOWN.';
COMMENT ON COLUMN planning_scenarios.liming_agronomist_confirmed_incorporation IS
  'Confirmação profissional explícita da decisão de incorporação; NULL=UNKNOWN.';

COMMIT;
