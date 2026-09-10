-- Cruzamento automático de parâmetro técnico com IA (pedido do diretor, 2026-09-09): quando a IA
-- consulta a literatura agronômica reconhecida e as faixas cadastradas batem com o que ela encontrou,
-- o parâmetro deve ficar sinalizado como pronto, pra tornar a homologação humana rápida (um clique em
-- lote) em vez de manual, campo a campo. IMPORTANTE: isto NUNCA homologa sozinho -- só adiciona um sinal
-- visível pro curador decidir mais rápido. A homologação (mudar `status` para ACTIVE) continua sendo
-- sempre uma ação humana explícita, exigida por CLAUDE.md ("IA não decide agronomia" / "nenhuma
-- recomendação oficial é publicada sem revisão profissional") -- essa regra não muda.
ALTER TABLE crop_profile_parameters
  ADD COLUMN ai_validation_status text NOT NULL DEFAULT 'NAO_VALIDADO'
    CHECK (ai_validation_status IN ('NAO_VALIDADO', 'CONSISTENTE', 'INCONSISTENTE', 'INDETERMINADO')),
  ADD COLUMN ai_validation_confidence numeric(5,2) CHECK (ai_validation_confidence IS NULL OR (ai_validation_confidence >= 0 AND ai_validation_confidence <= 100)),
  ADD COLUMN ai_validation_summary text,
  -- Fontes citadas pela própria IA no cruzamento (ex.: [{"title":"Boletim 100 - IAC","institution":"IAC"}]) --
  -- guardado pra rastreabilidade (CLAUDE.md exige origem rastreável), nunca inventado por nós, só repassado.
  ADD COLUMN ai_validation_sources jsonb,
  -- Nome real do modelo que rodou (ex.: "gemini-3.6-flash") -- nunca um número fictício de "IAs que
  -- concordaram": hoje só há um provedor de IA configurado nesta instância, então o rótulo na tela precisa
  -- dizer isso com honestidade, não sugerir um cruzamento entre múltiplos modelos que não aconteceu.
  ADD COLUMN ai_validation_model text,
  ADD COLUMN ai_validated_at timestamptz;

COMMENT ON COLUMN crop_profile_parameters.ai_validation_status IS 'Resultado do cruzamento automático com a IA -- sinal pro curador, nunca substitui a homologação humana.';
