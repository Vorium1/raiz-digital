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

-- "ALTER DEFAULT PRIVILEGES FOR ROLE postgres" removida daqui (só funcionava, e mesmo assim sem efeito
-- real, em ambiente onde existisse um papel chamado literalmente "postgres" -- em provedores como Neon
-- esse papel nem existe, e a migration inteira falhava com "role postgres does not exist"). A versão
-- portável (sem "FOR ROLE", aplicada ao papel que está executando a migration, seja qual for o nome)
-- já está na migration 007_app_runtime_role_portability.sql, que roda logo em seguida -- não duplicar aqui.

COMMIT;
