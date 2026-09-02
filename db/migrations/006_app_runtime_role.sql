BEGIN;

-- Papel de execução da aplicação, separado do papel usado para migrations.
-- O papel de migrations (postgres/raiz) costuma ter BYPASSRLS ou ser dono das
-- tabelas, o que faz o RLS ser ignorado (ver migration 005). A aplicação em
-- runtime deve se conectar com este papel restrito, sem BYPASSRLS e sem ser
-- dono de nada, para que o isolamento multiempresa seja realmente aplicado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'raiz_app') THEN
    CREATE ROLE raiz_app LOGIN PASSWORD NULL;
  END IF;
END $$;

ALTER ROLE raiz_app NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION LOGIN;

GRANT USAGE ON SCHEMA public TO raiz_app;
GRANT USAGE ON SCHEMA app TO raiz_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO raiz_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO raiz_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO raiz_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO raiz_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO raiz_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO raiz_app;

COMMIT;
