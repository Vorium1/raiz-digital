BEGIN;

-- Catálogo versionado para alimentar o motor agroclimático/fitossanitário sem
-- depender de arrays hardcoded por cultura/UF.
--
-- Perfis nascem DRAFT. Só ACTIVE pode ser usado em decisão oficial.
-- Todo perfil regional aponta para uma technical_region georreferenciável.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agroclimate_profile_kind') THEN
    CREATE TYPE agroclimate_profile_kind AS ENUM (
      'PHYSIOLOGY',
      'REGIONAL_CLIMATE',
      'DISEASE',
      'ZARC_CONTEXT'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agroclimate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  semantic_version text NOT NULL DEFAULT '0.1.0',
  kind agroclimate_profile_kind NOT NULL,
  crop_profile_id uuid NOT NULL REFERENCES crop_profiles(id) ON DELETE CASCADE,
  technical_region_code text NOT NULL REFERENCES technical_regions(code),
  technical_source_id uuid REFERENCES technical_sources(id),
  disease_code text,
  phenological_stages text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text,
  status crop_profile_status NOT NULL DEFAULT 'DRAFT',
  valid_from date,
  valid_until date,
  authored_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agroclimate_profiles_code_version_unique UNIQUE (code, semantic_version),
  CONSTRAINT agroclimate_profiles_validity_check
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT agroclimate_profiles_disease_code_check
    CHECK (kind <> 'DISEASE' OR nullif(disease_code, '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS agroclimate_profiles_crop_region_idx
  ON agroclimate_profiles (crop_profile_id, technical_region_code, kind, status);

CREATE INDEX IF NOT EXISTS agroclimate_profiles_stages_gin
  ON agroclimate_profiles USING gin (phenological_stages);

CREATE INDEX IF NOT EXISTS agroclimate_profiles_payload_gin
  ON agroclimate_profiles USING gin (payload jsonb_path_ops);

COMMENT ON TABLE agroclimate_profiles IS
  'Perfis versionados de fisiologia, clima regional, doenças e contexto ZARC. Só ACTIVE pode alimentar decisão oficial.';

COMMENT ON COLUMN agroclimate_profiles.payload IS
  'Regras/limiares/condições do perfil. Deve ser validado pelo runtime do tipo correspondente antes da homologação.';

COMMENT ON COLUMN agroclimate_profiles.technical_region_code IS
  'Escopo geográfico explícito. PHYSIOLOGY nacional usa BR; regras regionais usam UF/município/polígono específico.';

COMMIT;
