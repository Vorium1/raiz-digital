-- Limite mensal de prescrição por IA, por empresa cliente (pedido do diretor,
-- 2026-09-03: "limitar por mês quantas empresa pode usar"). É a alavanca de
-- controle de custo por plano vendido -- a peça mais cara da IA agronômica
-- (busca na web) já ficou isolada na pesquisa periódica; o laudo do dia a dia
-- é mais barato, mas ainda tem custo real por chamada, então precisa de teto.
-- Default 50 cobre a faixa de plano discutida (30-50 laudos/mês).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS monthly_prescription_limit integer NOT NULL DEFAULT 50
    CHECK (monthly_prescription_limit >= 0);
