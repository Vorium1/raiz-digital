// Explicit synthetic E2E fixtures only. No agronomic engine is invoked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import ts from 'typescript';

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error('DATABASE_URL must point to a disposable local test database.');
const parsed = new URL(rawUrl);
const host = parsed.searchParams.get('host') ?? parsed.hostname;
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !(['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.startsWith('/tmp/')) ||
    parsed.searchParams.has('hostaddr') || parsed.searchParams.has('service')) {
  throw new Error('Integration test refuses nonlocal database connections.');
}
const client = new pg.Client({ connectionString: rawUrl, ssl: false });
await client.connect();
const withTenant = async (context, work) => {
  await client.query('SET LOCAL ROLE raiz_app');
  await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.user_id',$2,true)", [context.tenantId, context.userId ?? '']);
  try { return await work(client); }
  finally { await client.query('RESET ROLE'); }
};
async function loadModule(path, dependencies = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
    if (name === '@/lib/db') return { withTenant };
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected runtime dependency ${name}`);
  }, Date, console }, { filename: path });
  return module.exports;
}
try {
  await client.query('BEGIN');
  const ids = Array.from({ length: 16 }, randomUUID);
  const [tenantA,tenantB,userA,userB,clientA,clientB,propertyA,propertyB,fieldA,fieldB,seasonA,seasonB,analysisA,analysisB,rule,interpretation1] = ids;
  const interpretation2 = randomUUID();
  await client.query("INSERT INTO tenants(id,legal_name,trade_name) VALUES($1,'E2E TIMELINE A','E2E TIMELINE A'),($2,'E2E TIMELINE B','E2E TIMELINE B')",[tenantA,tenantB]);
  await client.query("INSERT INTO users(id,name,email) VALUES($1,'E2E RESPONSIBLE A',$3),($2,'E2E PRIVATE RESPONSIBLE B',$4)",[userA,userB,`${userA}@e2e.invalid`,`${userB}@e2e.invalid`]);
  await client.query("INSERT INTO tenant_members(tenant_id,user_id,role) VALUES($1,$3,'TENANT_ADMIN'),($2,$4,'TENANT_ADMIN')",[tenantA,tenantB,userA,userB]);
  for (const [tenant,user,customer,property,field,season,analysis,label] of [[tenantA,userA,clientA,propertyA,fieldA,seasonA,analysisA,'A'],[tenantB,userB,clientB,propertyB,fieldB,seasonB,analysisB,'B']]) {
    await client.query("INSERT INTO clients(id,tenant_id,name) VALUES($1,$2,$3)",[customer,tenant,`E2E TIMELINE CLIENT ${label}`]);
    await client.query("INSERT INTO properties(id,tenant_id,client_id,name,municipality,state) VALUES($1,$2,$3,'E2E TIMELINE PROPERTY','E2E','SP')",[property,tenant,customer]);
    // Empty test geometry supplies no invented coordinates. Area is a synthetic fixture.
    await client.query("INSERT INTO fields(id,tenant_id,property_id,name,area_ha,boundary) VALUES($1,$2,$3,'E2E TIMELINE FIELD',1,ST_GeomFromText('MULTIPOLYGON EMPTY',4326))",[field,tenant,property]);
    await client.query("INSERT INTO crop_seasons(id,tenant_id,field_id,season_label) VALUES($1,$2,$3,$4)",[season,tenant,field,`E2E SEASON ${label}`]);
    await client.query("INSERT INTO analyses(id,tenant_id,crop_season_id,code,created_by) VALUES($1,$2,$3,$4,$5)",[analysis,tenant,season,`E2E ANALYSIS ${label}`,user]);
  }
  await client.query("INSERT INTO rule_sets(id,code,semantic_version,content_hash,region_code,supported_crops,supported_methods,rules,sources) VALUES($1,$2,'E2E-1',$3,'E2E','{}','{}','{}',$4)",[rule,`E2E RULE ${rule}`,`E2E HASH ${rule}`,JSON.stringify([{ title:'E2E SYNTHETIC SOURCE',url:'https://example.invalid/e2e' }])]);
  for (const [id,revision] of [[interpretation1,1],[interpretation2,2]]) {
    await client.query("INSERT INTO interpretations(id,tenant_id,analysis_id,rule_set_id,revision,structured_output,status,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$7,'IN_REVIEW',$6,now())",[id,tenantA,analysisA,rule,revision,userA,JSON.stringify({trace:{cropProfileCode:"E2E FROZEN RULE",cropProfileVersion:"E2E-1",cropProfileContentHash:"E2E FROZEN HASH"}})]);
  }
  await client.query("INSERT INTO agronomic_rule_executions(tenant_id,analysis_id,crop_season_id,rule_id,rule_version,source_snapshot_id,execution_status,source_trace,input_payload,output_payload,created_by) VALUES($1,$2,$3,'E2E RULE EXECUTION','E2E-1','E2E SOURCE SNAPSHOT','INSUFFICIENT_EVIDENCE',$4,'{}','{}',$5)",[tenantA,analysisA,seasonA,JSON.stringify({sourceTitle:'E2E SYNTHETIC EVIDENCE'}),userA]);
  await client.query("INSERT INTO audit_events(tenant_id,actor_user_id,actor_type,action,entity_type,entity_id) VALUES($1,$2,'USER','E2E PRIVATE ACTION','analysis',$3)",[tenantB,userB,analysisB]);
  const domain = await loadModule('src/domain/field-timeline.ts');
  const { getFieldTimeline } = await loadModule('src/lib/repositories/field-timeline.ts', { '@/domain/field-timeline': domain });
  const timeline = await getFieldTimeline(tenantA,fieldA,userA);
  assert.ok(timeline);
  assert.equal(timeline.fieldId,fieldA);
  assert.deepEqual(JSON.parse(JSON.stringify(timeline.seasons)),[{id:seasonA,label:'E2E SEASON A'}]);
  assert.ok(timeline.events.some(event => event.source.id === interpretation1),'Revision 1 must be preserved');
  assert.ok(timeline.events.some(event => event.source.id === interpretation2),'Revision 2 must be preserved');
  assert.ok(timeline.events.some(event => event.responsibleName === 'E2E RESPONSIBLE A'),'Responsible reviewer must be represented');
  assert.ok(timeline.events.some(event => event.rule?.version === 'E2E-1'),'Frozen rule version must be represented');
  const revisions = timeline.events.filter(event => event.category === 'RULE' && event.source.entityType === 'interpretation');
  assert.equal(revisions.length,2,'Both calculation revisions must remain visible');
  for (const event of revisions) {
    assert.equal(event.rule.code,'E2E FROZEN RULE');
    assert.equal(event.rule.hash,'E2E FROZEN HASH');
    assert.equal(event.analysisId,analysisA);
    assert.equal(event.seasonId,seasonA);
    assert.ok(event.evidenceRefs.some(ref => ref.entityType === 'analysis' && ref.id === analysisA),'Revision links its exact analysis');
  }
  const decisions = timeline.events.filter(event => event.category === 'DECISION' && event.source.entityType === 'interpretation');
  assert.equal(decisions.length,2,'Review events for both revisions must remain visible');
  for (const event of decisions) {
    assert.equal(event.responsibleName,'E2E RESPONSIBLE A');
    assert.ok(event.evidenceRefs.some(ref => ref.entityType === 'interpretation' && ref.id === event.source.id),'Review links its exact revision');
  }
  assert.equal(await getFieldTimeline(tenantA,'invalid-field',userA),null);
  // A current catalog update cannot replace the frozen version/hash on historical revisions.
  await client.query("UPDATE rule_sets SET semantic_version='E2E CURRENT DIFFERENT',content_hash=$2 WHERE id=$1",[rule,`E2E CURRENT HASH ${rule}`]);
  const refreshed = await getFieldTimeline(tenantA,fieldA,userA);
  for (const event of refreshed.events.filter(event => event.rule && event.source.entityType === 'interpretation')) {
    assert.equal(event.rule.version,'E2E-1');
    assert.equal(event.rule.hash,'E2E FROZEN HASH');
  }
  assert.equal(await getFieldTimeline(tenantA,fieldB,userA),null,'Foreign tenant field must be hidden');
  assert.ok(timeline.events.some(event => event.source.entityType === 'agronomic_rule_execution' && event.rule?.hash === null && event.evidenceRefs.some(ref => ref.entityType === 'source_snapshot' && ref.id === 'E2E SOURCE SNAPSHOT')),'Append-only rule execution and its frozen source snapshot must be represented');
  const timelineB = await getFieldTimeline(tenantB,fieldB,userB);
  assert.ok(timelineB.events.some(event => event.source.id === analysisB),'Tenant B fixture is a real timeline event');
  assert.ok(timelineB.events.every(event => event.analysisId !== analysisA),'Tenant B cannot see tenant A analysis');
  const serialized = JSON.stringify(timeline);
  for (const hidden of [tenantB,userB,clientB,propertyB,fieldB,seasonB,analysisB,'E2E PRIVATE RESPONSIBLE B','E2E PRIVATE ACTION']) assert.ok(!serialized.includes(hidden),'Foreign tenant data must remain invisible');
  console.log('field timeline database: all revisions, season, responsible actor, frozen rules/evidence and tenant isolation passed (fixtures rolled back)');
} finally {
  await client.query('ROLLBACK');
  await client.end();
}
