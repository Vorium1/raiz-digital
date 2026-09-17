BEGIN;

-- A recomendação pode ser regenerada e aprovada sem criar uma nova revisão determinística.
-- Nesse caso, cada publicação precisa preservar um snapshot imutável distinto da decisão vigente.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_tenant_id_interpretation_id_revision_key;

-- O vínculo com a prescrição exata faz parte do estado oficial do relatório, não apenas do audit log.
-- Snapshots legados permanecem com NULL e, portanto, nunca são confundidos com uma decisão v3 corrente.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS prescription_generation_id uuid;

-- Índice único de apoio à FK composta: além do tenant, o banco passa a provar que a geração pertence
-- exatamente à mesma interpretação congelada pelo relatório.
CREATE UNIQUE INDEX IF NOT EXISTS ai_generations_tenant_interpretation_generation_uidx
  ON ai_generations (tenant_id, interpretation_id, id);

-- Backfill somente quando a trilha antiga aponta para uma geração realmente existente, do tipo correto
-- e vinculada à mesma interpretação. Histórico incompleto/inconsistente continua NULL e fail-closed.
WITH publication_links AS (
  SELECT DISTINCT ON (ae.tenant_id, ae.entity_id)
         ae.tenant_id,
         ae.entity_id AS report_id,
         (ae.metadata->>'approvedPrescriptionId')::uuid AS prescription_id
  FROM audit_events ae
  WHERE ae.entity_type = 'report'
    AND ae.action = 'REPORT_PUBLISHED'
    AND coalesce(ae.metadata->>'approvedPrescriptionId','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ORDER BY ae.tenant_id, ae.entity_id, ae.created_at DESC
)
UPDATE reports r
SET prescription_generation_id = links.prescription_id
FROM publication_links links
JOIN ai_generations ag
  ON ag.tenant_id = links.tenant_id
 AND ag.id = links.prescription_id
 AND ag.kind = 'AGRONOMIC_PRESCRIPTION'
WHERE r.prescription_generation_id IS NULL
  AND r.tenant_id = links.tenant_id
  AND r.id = links.report_id
  AND ag.interpretation_id = r.interpretation_id;

ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_prescription_generation_fk;
ALTER TABLE reports
  ADD CONSTRAINT reports_prescription_generation_fk
  FOREIGN KEY (tenant_id, interpretation_id, prescription_generation_id)
  REFERENCES ai_generations (tenant_id, interpretation_id, id);

-- Uma mesma prescrição aprovada só pode originar uma publicação oficial por interpretação.
-- Uma nova prescrição (novo id) pode ser publicada sobre a mesma revisão determinística sem apagar histórico.
CREATE UNIQUE INDEX IF NOT EXISTS reports_decision_unique_idx
  ON reports (tenant_id, interpretation_id, prescription_generation_id)
  WHERE prescription_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reports_interpretation_published_idx
  ON reports (tenant_id, interpretation_id, published_at DESC);

COMMIT;
