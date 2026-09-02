BEGIN;

-- A migration 006 declarou "ALTER DEFAULT PRIVILEGES FOR ROLE postgres ...",
-- o que só funciona porque no Supabase o papel administrativo se chama
-- "postgres". Em qualquer outro ambiente (ex.: compose.yaml local, onde o
-- papel administrativo é "raiz"), essa cláusula não teria efeito nenhum e
-- tabelas futuras não herdariam os privilégios do raiz_app. Redeclarada aqui
-- sem "FOR ROLE", o que aplica ao papel que está executando esta migration
-- (o papel administrativo, seja qual for o nome dele em cada ambiente).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO raiz_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO raiz_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO raiz_app;

COMMIT;
