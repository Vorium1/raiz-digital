BEGIN;

-- 001-004 ligaram RLS (ENABLE ROW LEVEL SECURITY) mas não forçaram a política
-- para o dono da tabela. No PostgreSQL, o dono da tabela ignora RLS por padrão,
-- mesmo com a política criada — isso deixava o isolamento multiempresa inativo
-- para qualquer conexão feita com o papel usado nas migrations (inclusive em
-- produção, se o mesmo papel for reaproveitado pela aplicação).
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_members','clients','properties','fields','crop_seasons','collection_orders',
    'sample_points','analyses','lab_samples','lab_results','interpretations','reports',
    'subscriptions','invoices','analysis_imports','analysis_import_rows',
    'laboratories','audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

COMMIT;
