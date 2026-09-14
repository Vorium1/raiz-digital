BEGIN;

ALTER TABLE technical_sources
  ADD COLUMN evidence_type text NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN evidence_strength text NOT NULL DEFAULT 'UNASSESSED',
  ADD COLUMN context_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN critical_dimensions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN requires_local_calibration boolean NOT NULL DEFAULT true,
  ADD COLUMN requires_agronomist_review boolean NOT NULL DEFAULT true,
  ADD COLUMN quantitative_use_status text NOT NULL DEFAULT 'CONTEXT_ONLY',
  ADD COLUMN quantitative_applicability_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN homologated_rule_id text,
  ADD COLUMN source_locator text,
  ADD COLUMN source_url text,
  ADD COLUMN doi text,
  ADD COLUMN study_design text,
  ADD COLUMN peer_reviewed boolean;

ALTER TABLE technical_sources
  ADD CONSTRAINT technical_sources_evidence_type_chk
  CHECK (evidence_type IN (
    'UNCLASSIFIED',
    'MECHANISTIC',
    'CALIBRATED_RESPONSE',
    'MULTILOCATION_TRIAL',
    'CONTROLLED_FIELD_TRIAL',
    'OBSERVATIONAL_FIELD',
    'REGIONAL_MANUAL',
    'SYSTEMATIC_REVIEW',
    'META_ANALYSIS'
  )),
  ADD CONSTRAINT technical_sources_evidence_strength_chk
  CHECK (evidence_strength IN (
    'UNASSESSED',
    'DIRECT_STRONG',
    'TRANSFERRED_STRONG',
    'MODERATE',
    'EXPERIMENTAL',
    'OBSERVATIONAL',
    'CONFLICTING',
    'INSUFFICIENT'
  )),
  ADD CONSTRAINT technical_sources_context_profile_object_chk
  CHECK (jsonb_typeof(context_profile) = 'object'),
  ADD CONSTRAINT technical_sources_quantitative_use_status_chk
  CHECK (quantitative_use_status IN (
    'CONTEXT_ONLY',
    'REVIEW_ONLY',
    'HOMOLOGATED_DETERMINISTIC'
  )),
  ADD CONSTRAINT technical_sources_homologated_rule_guard_chk
  CHECK (
    quantitative_use_status <> 'HOMOLOGATED_DETERMINISTIC'
    OR (
      homologated_rule_id IS NOT NULL
      AND length(trim(homologated_rule_id)) > 0
      AND quantitative_applicability_approved = true
    )
  );

CREATE INDEX technical_sources_evidence_type_idx
  ON technical_sources (evidence_type, evidence_strength, status);
CREATE INDEX technical_sources_context_profile_gin
  ON technical_sources USING gin (context_profile);

COMMENT ON COLUMN technical_sources.evidence_type IS
  'Tipo de evidência científica. Fonte externa comparável não vira automaticamente regra de dose.';
COMMENT ON COLUMN technical_sources.context_profile IS
  'Perfil estruturado do ambiente/solo/cultura/método em que a evidência foi produzida. Restrições quantitativas devem vir da própria fonte, sem tolerâncias inventadas.';
COMMENT ON COLUMN technical_sources.critical_dimensions IS
  'Dimensões cujo contexto deve estar explicitamente descrito na fonte e no alvo para avaliar transferibilidade.';
COMMENT ON COLUMN technical_sources.requires_local_calibration IS
  'Indica que a evidência não deve ser tratada como calibração local automática, mesmo se agronomicamente comparável.';
COMMENT ON COLUMN technical_sources.quantitative_use_status IS
  'CONTEXT_ONLY/REVIEW_ONLY por padrão. Dose numérica só pode ser liberada por regra determinística explicitamente homologada.';
COMMENT ON COLUMN technical_sources.quantitative_applicability_approved IS
  'Aprovação explícita para o domínio quantitativo definido pelo homologated_rule_id; similaridade agronômica sozinha nunca altera este campo.';
COMMENT ON COLUMN technical_sources.source_locator IS
  'Página, tabela, seção, figura ou outro localizador auditável na fonte primária.';
COMMENT ON COLUMN technical_sources.source_url IS
  'URL da fonte primária ou registro oficial. Resultado de IA não deve ocupar este campo como fonte científica.';

COMMIT;
