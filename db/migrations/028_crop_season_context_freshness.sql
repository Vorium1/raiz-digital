-- Versão temporal do contexto da safra para invalidar, de forma rastreável,
-- prescrições geradas antes de uma mudança de contexto agronômico.
--
-- `crop_seasons` nasceu sem `updated_at`. A migration 027 passou a atualizar
-- esse campo ao salvar meta produtiva/ordem pós-análise, então esta coluna é
-- obrigatória antes do fluxo chegar ao banco real.
--
-- Para linhas históricas existentes usamos `now()` de propósito (em vez de
-- `created_at`): não conseguimos provar que o contexto nunca mudou antes desta
-- migration. Assim, prescrições antigas ficam conservadoramente "stale" e
-- precisam ser regeneradas antes de uma nova aprovação/promoção de doses.

ALTER TABLE crop_seasons
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE crop_seasons
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE crop_seasons
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

COMMENT ON COLUMN crop_seasons.updated_at IS
  'Última mudança persistida no contexto da safra. Prescrições de IA anteriores a esta data são históricas/stale e devem ser regeneradas antes de aprovação.';
