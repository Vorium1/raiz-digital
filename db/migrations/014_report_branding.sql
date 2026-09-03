-- Marca própria de cada empresa cliente nos relatórios entregues ao produtor: logo (data URI,
-- pequeno o bastante pra caber numa coluna de texto) e identificação do responsável técnico que
-- assina (nome + registro profissional, ex.: CREA). Sem isso, todo relatório saía com a marca da
-- RAIZ Digital em vez da marca de quem realmente assina e entrega ao produtor.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS report_logo_data_url text,
  ADD COLUMN IF NOT EXISTS report_responsible_name text,
  ADD COLUMN IF NOT EXISTS report_responsible_registration text;
