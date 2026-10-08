BEGIN;

ALTER TABLE planning_scenario_crops
  ADD COLUMN rice_response_class text NULL
    CHECK (rice_response_class IS NULL OR rice_response_class IN ('MEDIA','ALTA','MUITO_ALTA')),
  ADD COLUMN rice_response_class_approved boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT planning_rice_response_class_approval_check
    CHECK (rice_response_class_approved = false OR rice_response_class IS NOT NULL);

COMMENT ON COLUMN planning_scenario_crops.rice_response_class IS
  'Classe de resposta SOSBAI explicitamente escolhida para arroz contínuo. Nunca inferida de meta, clima, preço ou investimento.';
COMMENT ON COLUMN planning_scenario_crops.rice_response_class_approved IS
  'Confirmação explícita da classe de resposta do arroz. Só true autoriza o motor determinístico SOSBAI a selecionar a coluna da tabela de N.';

COMMIT;
