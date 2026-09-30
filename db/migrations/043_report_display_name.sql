-- Nome de exibição independente para relatórios co-branded.
-- Permite que um tenant de homologação/holding preserve sua identidade interna
-- enquanto o PDF mostra a marca comercial que assina e entrega o documento.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS report_display_name text;
