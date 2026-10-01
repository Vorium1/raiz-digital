import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as filters from "../src/domain/field-timeline-filters.ts";

// Ensure date-only and timestamp grouping is exercised at the actual local offset.
process.env.TZ = "America/Sao_Paulo";

const event = (id, category, extra = {}) => ({
  id, category, occurredAt: "2026-09-30T14:00:00Z", dateBasis: "EVENT", seasonId: "s1", analysisId: "a1",
  title: `Evento ${id}`, detail: "Registro de teste", source: { entityType: "analysis", id: "a1", href: "/analises/a1" },
  responsibleName: null, rule: null, evidenceRefs: [], limitations: [], ...extra,
});
const payload = { fieldId: "f1", seasons: [{ id: "s1", label: "Safra cadastrada" }], undatedCount: 1, events: [
  event("decision", "DECISION", { responsibleName: "Responsável registrado", rule: { code: "REGRA", version: "1.0", hash: "hash-real-do-teste" }, evidenceRefs: [{ entityType: "analysis", id: "a1", href: "/analises/a1", label: "Laudo de origem" }], limitations: ["Método ainda não homologado"] }),
  event("delivery", "DELIVERY"),
  event("day30-time", "LAB", { occurredAt: "2026-09-30T04:00:00Z" }),
  event("day29-time", "LAB", { occurredAt: "2026-09-30T01:00:00Z" }),
  event("day30-date", "LAB", { occurredAt: "2026-09-30" }),
  event("old-season", "LAB", { seasonId: "s2" }),
  event("global", "FOLLOWUP", { seasonId: null, occurredAt: "2026-09-29", dateBasis: "REGISTERED" }),
] };

// Real JSX rendering and real filters, with hook storage and HTTP controlled.
function harness(fetcher) {
  const states = [], effectSlots = [];
  let cursor = 0, tree, props = { fieldId: "f1", seasonId: "s1" };
  const pending = [], exports = {}, calls = [];
  const source = readFileSync(new URL("../src/components/field-decision-timeline.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports, Error, AbortController, Intl, Date,
    fetch: (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    require(name) {
      if (name === "react") return { ...React, useMemo: fn => fn(), useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      }, useEffect(callback, dependencies) {
        const index = cursor++;
        const previous = effectSlots[index];
        if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
          effectSlots[index] = { dependencies, cleanup: previous?.cleanup };
          pending.push(() => { previous?.cleanup?.(); effectSlots[index].cleanup = callback(); });
        }
      } };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name.endsWith("field-timeline-filters")) return filters;
      if (name === "next/link") return { default: ({ children, ...rest }) => React.createElement("a", rest, children) };
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  function render(nextProps) { if (nextProps) props = nextProps; cursor = 0; tree = exports.FieldDecisionTimeline(props); return renderToStaticMarkup(tree); }
  function walk(node, callback) {
    if (!React.isValidElement(node)) return;
    callback(node);
    React.Children.forEach(node.props.children, child => walk(child, callback));
  }
  return {
    calls, render,
    async effects() { while (pending.length) pending.shift()(); await new Promise(resolve => setTimeout(resolve, 0)); },
    unmount() { effectSlots.forEach(slot => slot?.cleanup?.()); },
    change(label, value) {
      render(); let control;
      walk(tree, node => {
        if (node.type !== "label") return;
        const children = React.Children.toArray(node.props.children);
        if (children.some(child => React.isValidElement(child) && child.type === "span" && child.props.children === label)) control = children.find(child => React.isValidElement(child) && ["select", "input"].includes(child.type));
      });
      assert.ok(control, label); control.props.onChange({ target: { value } });
    },
    retry() {
      render(); let button;
      walk(tree, node => { if (node.type === "button" && node.props.children === "Tentar novamente") button = node; });
      assert.ok(button); button.props.onClick();
    },
  };
}
const history = harness(async () => Response.json(payload));
assert.match(history.render(), /Carregando histórico/);
assert.equal(history.calls.length, 0, "no fetch before the mounted effect runs");
await history.effects();
let html = history.render();
assert.equal(history.calls[0].url, "/api/fields/f1/timeline");
assert.equal(history.calls[0].options.cache, "no-store");
assert.match(html, /Responsável registrado/);
assert.match(html, /hash-real-do-teste/);
assert.match(html, /Laudo de origem/);
assert.match(html, /Origem · Análise/);
assert.match(html, /ID: a1/);
assert.match(html, /Abrir contexto do registro/);
assert.match(html, /contexto atual da análise/);
assert.equal((html.match(/class="dayHeading">30\/09\/2026/g) || []).length, 1, "mixed timestamp and date-only events have a single calendar-day group");
assert.ok(html.indexOf("Evento day30-time") < html.indexOf("Evento day30-date"), "relative ordering within the day is preserved");
assert.ok(html.indexOf("Evento day30-date") < html.indexOf("Evento day29-time"), "calendar days remain newest first");
assert.match(html, /Método ainda não homologado/);
assert.match(html, /Histórico do talhão · sem vínculo de safra/);
assert.match(html, /Registrado em 29\/09\/2026/);
assert.doesNotMatch(html, /Evento old-season/);
assert.match(html, /1 registro\(s\) sem data válida/);
history.change("Tipo de evento", "DECISION");
html = history.render();
assert.match(html, /Evento decision/);
assert.doesNotMatch(html, /Evento delivery/);
history.change("De", "2026-10-01");
assert.match(history.render(), /Nenhum evento registrado/);
history.change("Até", "2026-09-01");
assert.match(history.render(), /A data inicial deve ser anterior/);
history.unmount();
assert.equal(history.calls[0].options.signal.aborted, true);

let attempt = 0;
const retrying = harness(async () => ++attempt === 1 ? new Response("", { status: 500 }) : Response.json(payload));
retrying.render(); await retrying.effects();
assert.match(retrying.render(), /Não foi possível carregar/);
retrying.retry(); retrying.render(); await retrying.effects();
assert.match(retrying.render(), /Evento decision/);
assert.equal(attempt, 2);

let finishOld;
const race = harness(url => url.includes("f1") ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(Response.json({ ...payload, fieldId: "f2", events: [] })));
race.render(); await race.effects();
race.render({ fieldId: "f2", seasonId: "s1" }); await race.effects();
finishOld(Response.json(payload)); await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(race.calls[0].options.signal.aborted, true);
assert.match(race.render(), /Nenhum evento registrado/);
assert.doesNotMatch(race.render(), /Evento decision/);
console.log("field-decision-timeline-ui: fontes, limites, filtros, calendário, lazy fetch, retry e cancelamento aprovados");
