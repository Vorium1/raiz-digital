BEGIN;

-- A recomendação pode ser regenerada e aprovada sem criar uma nova revisão determinística.
-- Nesse caso, cada publicação precisa preservar um snapshot imutável distinto da decisão vigente.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_tenant_id_interpretation_id_revision_key;

-- O vínculo com a prescrição exata faz parte do estado oficial do relatório, não apenas do audit log.
-- Snapshots legados permanecem com NULL e, portanto, nunca são confundidos com uma decisão v3 corrente.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS prescription_generation_id uuid;

UPDATE reports r
SET prescription_generation_id = (ae.metadata->>'approvedPrescriptionId')::uuid
FROM audit_events ae
WHERE r.prescription_generation_id IS NULL
  AND ae.tenant_id = r.tenant_id
  AND ae.entity_type = 'report'
  AND ae.entity_id = r.id
  AND ae.action = 'REPORT_PUBLISHED'
  AND coalesce(ae.metadata->>'approvedPrescriptionId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_prescription_generation_fk;
ALTER TABLE reports
  ADD CONSTRAINT reports_prescription_generation_fk
  FOREIGN KEY (tenant_id, prescription_generation_id)
  REFERENCES ai_generations (tenant_id, id);

-- Uma mesma prescrição aprovada só pode originar uma publicação oficial por interpretação.
-- Uma nova prescrição (novo id) pode ser publicada sobre a mesma revisão determinística sem apagar histórico.
CREATE UNIQUE INDEX IF NOT EXISTS reports_decision_unique_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id)
  WHERE prescription_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_interpretation_published_idx
  ON reports (tenant_id, interpretation_id, published_at DESC);

COMMIT;
