BEGIN;

ALTER TABLE planning_scenarios
  ADD COLUMN base_evidence_date date,
  ADD COLUMN management_system text,
  ADD COLUMN irrigation_type text,
  ADD COLUMN irrigation_capacity_notes text,
  ADD COLUMN water_availability_notes text,
  ADD COLUMN known_restrictions text,
  ADD COLUMN previous_crop text,
  ADD COLUMN recent_crop_history text,
  ADD COLUMN last_soil_correction text,
  ADD COLUMN fertilization_history text,
  ADD COLUMN organic_inputs text;

COMMENT ON COLUMN planning_scenarios.base_evidence_date IS
  'Data da evidência/análise de solo usada como base, informada explicitamente; nunca inferida de created_at.';
COMMENT ON COLUMN planning_scenarios.management_system IS
  'Contexto de manejo declarado para a simulação; não cria regra agronômica.';
COMMENT ON COLUMN planning_scenarios.irrigation_type IS
  'Tipo de irrigação declarado; nullable significa UNKNOWN, não sequeiro.';
COMMENT ON COLUMN planning_scenarios.irrigation_capacity_notes IS
  'Capacidade/limitação de irrigação declarada em texto, sem unidade inferida.';
COMMENT ON COLUMN planning_scenarios.water_availability_notes IS
  'Disponibilidade hídrica declarada; não substitui evidência climática oficial.';
COMMENT ON COLUMN planning_scenarios.known_restrictions IS
  'Restrições operacionais conhecidas declaradas pelo usuário.';
COMMENT ON COLUMN planning_scenarios.previous_crop IS
  'Cultura anterior declarada, sem inferência.';
COMMENT ON COLUMN planning_scenarios.recent_crop_history IS
  'Histórico recente de culturas declarado, sem inferência.';
COMMENT ON COLUMN planning_scenarios.last_soil_correction IS
  'Última correção/calagem declarada quando disponível.';
COMMENT ON COLUMN planning_scenarios.fertilization_history IS
  'Histórico de adubação/fontes comerciais declarado quando disponível.';
COMMENT ON COLUMN planning_scenarios.organic_inputs IS
  'Matéria orgânica/insumos orgânicos declarados; não representa análise laboratorial de MO.';

COMMIT;
