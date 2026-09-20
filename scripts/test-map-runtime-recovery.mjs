import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { monitorGoogle3DHealth } from "../src/lib/maps/google-3d-health.ts";

// Execute the real effects with isolated hook state and network failures. No browser or DB writes.
function componentHarness(path, name, fetchImpl) {
  let cursor = 0;
  const state = [], effects = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
      return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect: fn => effects.push(fn),
  };
  const exports = {};
  const context = {
    exports, AbortController, Error, URL, console, fetch: fetchImpl,
    require(id) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id.includes("ndvi-engine")) return { VIGOR_ZONE_LABELS: {}, NDVI_QUALITY_LABELS: {} };
      return {};
    },
  };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return { effects, render() { cursor = 0; effects.length = 0; return exports[name]({ fieldId: "test-only" }); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function textOf(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(textOf).join(" ");
  if (typeof tree !== "object") return String(tree);
  return textOf(tree.props?.children);
}

const panel = componentHarness("../src/components/field-ndvi-panel.tsx", "FieldNdviPanel", async () => { throw new Error("Network offline"); });
panel.render();
const cleanupPanel = panel.effects[0]();
await settle();
const failedPanel = textOf(panel.render());
assert.doesNotMatch(failedPanel, /Carregando vigor/);
assert.match(failedPanel, /Network offline/);
cleanupPanel();

let capturedSignal;
const cancelled = componentHarness("../src/components/field-ndvi-panel.tsx", "FieldNdviPanel", async (_url, options) => {
  capturedSignal = options.signal;
  return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
});
cancelled.render();
cancelled.effects[0]()();
await settle();
assert.equal(capturedSignal.aborted, true, "unmount must cancel satellite request");

// Synthetic response only for testing the component's recovery UI, never persisted.
const vigor = componentHarness("../src/components/simple-field-vigor.tsx", "SimpleFieldVigor", async url => {
  if (url.includes("/map?")) return { ok: false };
  return { ok: true, json: async () => ({ history: [{ capturedAt: "2026-01-01", rasterObjectKey: "test", meanNdvi: 0.5 }], fieldBoundary: { type: "Polygon", coordinates: [] } }) };
});
vigor.render();
const cleanupVigor = vigor.effects[0]();
await settle();
vigor.render();
const cleanupRaster = vigor.effects[1]();
await settle();
const failedRaster = textOf(vigor.render());
assert.doesNotMatch(failedRaster, /Preparando o mapa de vigor/);
assert.match(failedRaster, /Tentar carregar imagem novamente/);
cleanupVigor(); cleanupRaster();

for (const eventName of ["gmp-error", "gmp-map-id-error"]) {
  const target = new EventTarget(); let failures = 0;
  const stop = monitorGoogle3DHealth(target, () => failures++, 100);
  target.dispatchEvent(new Event(eventName)); target.dispatchEvent(new Event(eventName));
  assert.equal(failures, 1, "runtime error must trigger fallback once"); stop();
}
const pending = new EventTarget(); let timeouts = 0;
const stopPending = monitorGoogle3DHealth(pending, () => timeouts++, 5);
await new Promise(resolve => setTimeout(resolve, 15));
assert.equal(timeouts, 1); stopPending();
const ready = new EventTarget(); let readyFailures = 0;
const stopReady = monitorGoogle3DHealth(ready, () => readyFailures++, 5);
ready.dispatchEvent(Object.assign(new Event("gmp-steadychange"), { isSteady: true }));
await new Promise(resolve => setTimeout(resolve, 15));
assert.equal(readyFailures, 0, "rendered map must not time out");
ready.dispatchEvent(new Event("gmp-error"));
assert.equal(readyFailures, 1, "runtime errors after readiness still require fallback");
stopReady();
const unmounted = new EventTarget(); let afterUnmount = 0;
monitorGoogle3DHealth(unmounted, () => afterUnmount++, 5)();
unmounted.dispatchEvent(new Event("gmp-error"));
await new Promise(resolve => setTimeout(resolve, 15));
assert.equal(afterUnmount, 0);
console.log("OK — NDVI network/raster recovery, cancellation, 3D errors/readiness/timeout/cleanup.");
