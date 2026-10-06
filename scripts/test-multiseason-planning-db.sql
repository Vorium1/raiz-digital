\set ON_ERROR_STOP on
BEGIN;
INSERT INTO tenants(id,legal_name,trade_name) VALUES ('10000000-0000-4000-8000-000000000001','Planning A','A'),('10000000-0000-4000-8000-000000000002','Planning B','B');
INSERT INTO users(id,name,email) VALUES ('10000000-0000-4000-8000-000000000011','Planning test','planning@test.invalid');
INSERT INTO clients(id,tenant_id,name) VALUES ('10000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000001','Client A');
INSERT INTO properties(id,tenant_id,client_id,name,municipality,state) VALUES ('10000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000021','Property A','A','RS');
INSERT INTO fields(id,tenant_id,property_id,name,area_ha,boundary) VALUES ('10000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000031','Field A',10,ST_GeomFromText('MULTIPOLYGON(((0 0,0 1,1 1,1 0,0 0)))',4326));
INSERT INTO planning_scenarios(id,tenant_id,field_id,name,created_by) VALUES ('10000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000041','Scenario A','10000000-0000-4000-8000-000000000011');
INSERT INTO planning_scenario_crops(id,tenant_id,scenario_id,position,crop_code) VALUES ('10000000-0000-4000-8000-000000000061','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000051',0,'SOYBEAN'),('10000000-0000-4000-8000-000000000062','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000051',1,'WHEAT'),('10000000-0000-4000-8000-000000000063','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000051',2,'RICE');
INSERT INTO planning_scenario_snapshots(tenant_id,scenario_id,payload,sha256,created_by) VALUES ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000051','{"version":1}'::jsonb,repeat('a',64),'10000000-0000-4000-8000-000000000011');

SET LOCAL ROLE raiz_app;
SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000001',true);
DO $
BEGIN
  BEGIN
    UPDATE planning_scenario_snapshots
       SET payload='{"version":2}'::jsonb
     WHERE scenario_id='10000000-0000-4000-8000-000000000051'::uuid;
    RAISE EXCEPTION 'runtime updated immutable planning snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM planning_scenario_snapshots
     WHERE scenario_id='10000000-0000-4000-8000-000000000051'::uuid;
    RAISE EXCEPTION 'runtime deleted immutable planning snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  IF (SELECT count(*) FROM planning_scenario_snapshots) <> 1 THEN
    RAISE EXCEPTION 'immutable planning snapshot changed unexpectedly';
  END IF;
END $;

SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM planning_scenarios)<>0 OR (SELECT count(*) FROM planning_scenario_crops)<>0 OR (SELECT count(*) FROM planning_scenario_snapshots)<>0 THEN RAISE EXCEPTION 'tenant B leak'; END IF;
 IF EXISTS(SELECT 1 FROM planning_scenarios WHERE id='10000000-0000-4000-8000-000000000051') THEN RAISE EXCEPTION 'foreign scenario visible'; END IF;
END $$;
RESET ROLE; SELECT 'PASS: planning lifecycle, immutable snapshots and tenant B RLS invisibility' AS result; ROLLBACK;
