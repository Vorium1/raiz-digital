import { createHash } from "node:crypto";

export const PLANNING_SNAPSHOT_VERSION = 3;

function canonicalize(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value && typeof value==="object"){
    const record=value as Record<string,unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key)=>[key,canonicalize(record[key])])
    );
  }
  return value;
}

export function canonicalPlanningSnapshotJson(payload:unknown){
  return JSON.stringify(canonicalize(payload));
}

export function planningSnapshotSha256(payload:unknown){
  return createHash("sha256")
    .update(canonicalPlanningSnapshotJson(payload))
    .digest("hex");
}

export function buildPlanningSnapshotPayload(input:{
  createdAt:string;
  scenario:unknown;
  calculation:unknown;
}){
  const payload={
    version:PLANNING_SNAPSHOT_VERSION,
    createdAt:input.createdAt,
    scenario:input.scenario,
    calculation:input.calculation,
  };
  return {payload,sha256:planningSnapshotSha256(payload)};
}

export function verifyPlanningSnapshot(payload:unknown,expectedSha256:string){
  return /^[0-9a-f]{64}$/i.test(expectedSha256)
    && planningSnapshotSha256(payload)===expectedSha256.toLowerCase();
}
