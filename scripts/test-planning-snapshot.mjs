import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PLANNING_SNAPSHOT_VERSION,
  buildPlanningSnapshotPayload,
  canonicalPlanningSnapshotJson,
  planningSnapshotSha256,
  verifyPlanningSnapshot,
} from "../src/domain/planning-snapshot.ts";

assert.equal(PLANNING_SNAPSHOT_VERSION, 2);

const first={
  version:2,
  createdAt:"2026-10-06T20:00:00.000Z",
  scenario:{name:"A",context:{water:null,irrigated:false},crops:[{position:0,cropCode:"SOYBEAN"}]},
  calculation:{results:[{position:0,status:"PARTIAL"}]},
};
const reordered={
  calculation:{results:[{status:"PARTIAL",position:0}]},
  scenario:{crops:[{cropCode:"SOYBEAN",position:0}],context:{irrigated:false,water:null},name:"A"},
  createdAt:"2026-10-06T20:00:00.000Z",
  version:2,
};

assert.equal(
  canonicalPlanningSnapshotJson(first),
  canonicalPlanningSnapshotJson(reordered),
  "ordem de chaves do jsonb não pode alterar o hash canônico",
);
assert.equal(planningSnapshotSha256(first),planningSnapshotSha256(reordered));

const built=buildPlanningSnapshotPayload({
  createdAt:"2026-10-06T20:00:00.000Z",
  scenario:first.scenario,
  calculation:first.calculation,
});
assert.equal(built.payload.version,2);
assert.equal(verifyPlanningSnapshot(built.payload,built.sha256),true);
assert.equal(
  verifyPlanningSnapshot({...built.payload,scenario:{...built.payload.scenario,name:"alterado"}},built.sha256),
  false,
);

const repository=readFileSync(new URL("../src/lib/repositories/planning.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../src/app/api/planning/[id]/snapshots/[snapshotId]/route.ts",import.meta.url),"utf8");
assert.match(repository,/integrity:version>=2\?"VERIFIED":"LEGACY_UNVERIFIABLE"/);
assert.match(repository,/verifyPlanningSnapshot\(row\.payload,row\.sha256\)/);
assert.match(route,/getPlanningSnapshot\(session\.tenantId,id,snapshotId,session\.userId\)/);

console.log("planning-snapshot: hash canônico v2, verificação e leitura tenant-scoped aprovados");
