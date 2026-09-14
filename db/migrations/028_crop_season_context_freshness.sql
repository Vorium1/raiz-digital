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

-- Não dependemos de cada rota lembrar de atualizar o timestamp. Qualquer mudança
-- REAL na safra (cultura, cultivar, meta, manejo, irrigação, tecnologia etc.)
-- toca o contexto. UPDATE idempotente com os mesmos valores não invalida uma
-- prescrição só porque o usuário clicou em "salvar" novamente.
CREATE OR REPLACE FUNCTION touch_crop_seasons_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crop_seasons_touch_updated_at ON crop_seasons;
CREATE TRIGGER crop_seasons_touch_updated_at
BEFORE UPDATE ON crop_seasons
FOR EACH ROW
EXECUTE FUNCTION touch_crop_seasons_updated_at();
