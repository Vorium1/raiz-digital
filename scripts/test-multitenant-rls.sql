-- Local-only integration test: apply all migrations to a disposable database first.
-- Run with psql as its migration owner; fixtures are explicit E2E and rolled back.
-- No production database may be used for this test.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO tenants(id,legal_name,trade_name) VALUES ('00000000-0000-4000-8000-000000000001','E2E TENANT A','E2E A'),('00000000-0000-4000-8000-000000000002','E2E TENANT B','E2E B');
INSERT INTO clients(id,tenant_id,name,person_type,document_normalized,whatsapp,postal_code,state,country) VALUES ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','E2E CLIENT A','PF','00000000000','E2E WHATSAPP','00000000','SP','BR'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002','E2E CLIENT B','PF','00000000000','E2E WHATSAPP','00000000','SP','BR');
INSERT INTO properties(id,tenant_id,client_id,name,municipality,state) VALUES ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','E2E PROPERTY A','E2E','SP'),('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000012','E2E PROPERTY B','E2E','SP');
INSERT INTO users(id,name,email) VALUES ('00000000-0000-4000-8000-000000000031','E2E USER','multitenant-rls@e2e.invalid');
INSERT INTO commercial_input_products(tenant_id,code,name,kind,created_by,updated_by) VALUES
('00000000-0000-4000-8000-000000000001','E2E PRODUCT','E2E PRODUCT A','FERTILIZER','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000031'),
('00000000-0000-4000-8000-000000000002','E2E PRODUCT','E2E PRODUCT B','FERTILIZER','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000031');
SET LOCAL ROLE raiz_app;
DO $$ BEGIN
IF (SELECT count(*) FROM clients) <> 0 THEN RAISE EXCEPTION 'Missing tenant leaks clients'; END IF;
END $$;
SELECT set_config('app.tenant_id','00000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE n integer; BEGIN
IF (SELECT count(*) FROM clients) <> 1 THEN RAISE EXCEPTION 'Tenant A client isolation failed'; END IF;
IF (SELECT count(*) FROM properties) <> 1 THEN RAISE EXCEPTION 'Tenant A property isolation failed'; END IF;
IF (SELECT count(*) FROM commercial_input_products) <> 1 THEN RAISE EXCEPTION 'Commercial catalog isolation failed'; END IF;
-- Mirrors createProperty INSERT SELECT: hidden foreign parent returns zero rows.
INSERT INTO properties (tenant_id,client_id,name,municipality,state,boundary)
SELECT '00000000-0000-4000-8000-000000000001'::uuid,c.id,'E2E HIDDEN PARENT','E2E','SP',NULL
FROM clients c WHERE c.tenant_id='00000000-0000-4000-8000-000000000001'::uuid AND c.id='00000000-0000-4000-8000-000000000012'::uuid;
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>0 THEN RAISE EXCEPTION 'Scoped property creation exposed foreign client'; END IF;
-- Mirrors createField parent lookup; foreign parent is absent before geometry parsing.
IF EXISTS(SELECT id FROM properties WHERE tenant_id='00000000-0000-4000-8000-000000000001'::uuid AND id='00000000-0000-4000-8000-000000000022'::uuid) THEN RAISE EXCEPTION 'Field creation exposed foreign property'; END IF;
UPDATE commercial_input_products SET active=false WHERE tenant_id='00000000-0000-4000-8000-000000000002';
GET DIAGNOSTICS n=ROW_COUNT;
IF n<>0 THEN RAISE EXCEPTION 'Commercial catalog cross-tenant update allowed'; END IF;
BEGIN
INSERT INTO commercial_input_products(tenant_id,code,name,kind,created_by,updated_by) VALUES ('00000000-0000-4000-8000-000000000002','E2E ATTACK','E2E ATTACK','FERTILIZER','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000031');
RAISE EXCEPTION 'Commercial catalog cross-tenant insert allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
UPDATE clients SET notes='E2E ATTACK' WHERE tenant_id='00000000-0000-4000-8000-000000000002'; GET DIAGNOSTICS n=ROW_COUNT;
IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant update allowed'; END IF;
DELETE FROM clients WHERE tenant_id='00000000-0000-4000-8000-000000000002'; GET DIAGNOSTICS n=ROW_COUNT;
IF n<>0 THEN RAISE EXCEPTION 'Cross-tenant delete allowed'; END IF;
BEGIN
INSERT INTO clients(tenant_id,name) VALUES ('00000000-0000-4000-8000-000000000002','E2E ATTACK');
RAISE EXCEPTION 'Cross-tenant insert allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN
UPDATE clients SET tenant_id='00000000-0000-4000-8000-000000000002' WHERE id='00000000-0000-4000-8000-000000000011';
RAISE EXCEPTION 'Tenant reassignment allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN
INSERT INTO properties(tenant_id,client_id,name,municipality,state) VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012','E2E ATTACK','E2E','SP');
RAISE EXCEPTION 'Cross-tenant FK allowed';
EXCEPTION WHEN foreign_key_violation THEN NULL; END;
BEGIN
INSERT INTO clients(tenant_id,name,document_normalized) VALUES ('00000000-0000-4000-8000-000000000001','E2E DUPLICATE','00000000000');
RAISE EXCEPTION 'Same-tenant duplicate document allowed';
EXCEPTION WHEN unique_violation THEN NULL; END;
BEGIN
INSERT INTO clients(tenant_id,name,postal_code) VALUES ('00000000-0000-4000-8000-000000000001','E2E INVALID','invalid');
RAISE EXCEPTION 'Invalid postal format allowed';
EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('app.tenant_id','00000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
IF (SELECT count(*) FROM commercial_input_products) <> 1 OR (SELECT name FROM commercial_input_products) <> 'E2E PRODUCT B' THEN RAISE EXCEPTION 'Tenant B catalog isolation failed'; END IF;
IF (SELECT count(*) FROM clients) <> 1 OR (SELECT name FROM clients) <> 'E2E CLIENT B' THEN RAISE EXCEPTION 'Tenant B isolation failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='raiz_app' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole)) THEN RAISE EXCEPTION 'Unsafe runtime role'; END IF;
IF EXISTS(SELECT 1 FROM pg_class WHERE relname IN ('clients','properties','fields','commercial_input_products') AND NOT(relrowsecurity AND relforcerowsecurity)) THEN RAISE EXCEPTION 'Missing FORCE RLS'; END IF;
END $$;
SELECT 'PASS: migrations 001-046; two-tenant RLS, missing context, cross-tenant CRUD/FK, document uniqueness and address checks' AS result;
ROLLBACK;
