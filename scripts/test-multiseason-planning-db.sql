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
INSERT INTO planning_crop_commercial_snapshots
(id,tenant_id,scenario_id,planning_crop_id,label,simulation_mode,area_ha,crop_position,crop_code,season_label,
 source_scenario_updated_at,source_crop_updated_at,source_targets,product_snapshots,engine_input,engine_output,created_by)
VALUES
('10000000-0000-4000-8000-000000000071','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000061',
 'Compra soja','SINGLE',10,0,'SOYBEAN','2026/2027',now(),now(),
 '[{"canonicalTarget":"P2O5","quantity":60,"unit":"kg/ha"}]'::jsonb,
 '[{"id":"product-test","name":"Produto teste","pricePerTon":3000}]'::jsonb,
 '{"mode":"SINGLE","driverNutrient":"P2O5"}'::jsonb,
 '{"rateKgPerHa":120,"totalCost":3600}'::jsonb,
 '10000000-0000-4000-8000-000000000011');

INSERT INTO planning_crop_agroclimate_snapshots
(id,tenant_id,scenario_id,planning_crop_id,provider,provider_version,source_urls,retrieved_at,
 municipality_name,state_code,ibge_municipality_code,crop_code,agritec_culture_id,planned_date,
 assessment,source_windows,source_scenario_updated_at,source_crop_updated_at,created_by)
SELECT
 '10000000-0000-4000-8000-000000000081',
 ps.tenant_id,ps.id,pc.id,'EMBRAPA_AGRITEC_V2','v2',
 '["https://api.cnptia.embrapa.br/agritec/v2/zoneamento"]'::jsonb,now(),
 'Passo Fundo','RS','4314100','SOYBEAN',60,'2026-11-05'::date,
 '{"status":"CONSENSUS_RISK","riskLevelsPct":[20],"warning":"ZARC_RISK_IS_NOT_YIELD_FORECAST"}'::jsonb,
 '[]'::jsonb,ps.updated_at,pc.updated_at,'10000000-0000-4000-8000-000000000011'
FROM planning_scenarios ps
JOIN planning_scenario_crops pc
  ON pc.tenant_id=ps.tenant_id AND pc.scenario_id=ps.id AND pc.position=0
WHERE ps.id='10000000-0000-4000-8000-000000000051'::uuid;

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

  BEGIN
    UPDATE planning_crop_commercial_snapshots
       SET label='alterado'
     WHERE id='10000000-0000-4000-8000-000000000071'::uuid;
    RAISE EXCEPTION 'runtime updated immutable planning commercial snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM planning_crop_commercial_snapshots
     WHERE id='10000000-0000-4000-8000-000000000071'::uuid;
    RAISE EXCEPTION 'runtime deleted immutable planning commercial snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  IF (SELECT count(*) FROM planning_crop_commercial_snapshots) <> 1 THEN
    RAISE EXCEPTION 'immutable planning commercial snapshot changed unexpectedly';
  END IF;

  BEGIN
    UPDATE planning_crop_agroclimate_snapshots
       SET assessment='{"status":"NOT_INDICATED"}'::jsonb
     WHERE id='10000000-0000-4000-8000-000000000081'::uuid;
    RAISE EXCEPTION 'runtime updated immutable planning agroclimate snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM planning_crop_agroclimate_snapshots
     WHERE id='10000000-0000-4000-8000-000000000081'::uuid;
    RAISE EXCEPTION 'runtime deleted immutable planning agroclimate snapshot';
  EXCEPTION
    WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN NULL;
  END;

  IF (SELECT count(*) FROM planning_crop_agroclimate_snapshots) <> 1 THEN
    RAISE EXCEPTION 'immutable planning agroclimate snapshot changed unexpectedly';
  END IF;
END $;

SELECT set_config('app.tenant_id','10000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM planning_scenarios)<>0
    OR (SELECT count(*) FROM planning_scenario_crops)<>0
    OR (SELECT count(*) FROM planning_scenario_snapshots)<>0
    OR (SELECT count(*) FROM planning_crop_commercial_snapshots)<>0
    OR (SELECT count(*) FROM planning_crop_agroclimate_snapshots)<>0
 THEN RAISE EXCEPTION 'tenant B leak'; END IF;
 IF EXISTS(SELECT 1 FROM planning_scenarios WHERE id='10000000-0000-4000-8000-000000000051') THEN RAISE EXCEPTION 'foreign scenario visible'; END IF;
END $$;
RESET ROLE; SELECT 'PASS: planning lifecycle, immutable agronomic/commercial/agroclimate snapshots and tenant B RLS invisibility' AS result; ROLLBACK;
