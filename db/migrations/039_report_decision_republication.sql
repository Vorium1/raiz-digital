BEGIN;

-- Migration 038 initially constrained one official report per deterministic decision
-- (tenant + interpretation + prescription). The publication flow intentionally allows
-- a NEW immutable report revision for the SAME decision when newer frozen evidence
-- (currently NDVI) becomes available after publication.
--
-- Keep that history instead of overwriting the previous report. Uniqueness therefore
-- belongs to the report revision inside the decision, while the lookup index keeps the
-- latest-publication check efficient.

DROP INDEX IF EXISTS reports_decision_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS reports_decision_revision_unique_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id, revision)
  WHERE prescription_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_decision_lookup_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id, published_at DESC)
  WHERE prescription_generation_id IS NOT NULL;

COMMIT;
