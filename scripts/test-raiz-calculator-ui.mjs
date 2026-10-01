import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as engine from "../src/domain/commercial-input-engine.ts";

// Render the real component and execute its change handlers. Only hook storage,
// decoration components and module resolution are injected; calculations are real.
function calculator(products = [], prefill) {
  const states = [];
  let cursor = 0;
  const exports = {};
  const source = readFileSync(new URL("../src/components/raiz-calculator.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports, Error,
    require(name) {
      if (name === "react") return { ...React, useMemo: fn => fn(), useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      } };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name.endsWith("commercial-input-engine")) return engine;
      if (name.endsWith("/icon")) return { Icon: () => null };
      if (name.endsWith("/ui")) return { StatusBadge: ({ children }) => React.createElement("span", null, children) };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  function tree() { cursor = 0; return exports.RaizCalculator({ products, prefill }); }
  function walk(node, callback) {
    if (!React.isValidElement(node)) return;
    callback(node);
    React.Children.forEach(node.props.children, child => walk(child, callback));
  }
  return {
    html: () => renderToStaticMarkup(tree()),
    change(label, value) {
      let control;
      walk(tree(), node => {
        if (node.type !== "label") return;
        const children = React.Children.toArray(node.props.children);
        if (children.some(child => React.isValidElement(child) && child.type === "span" && child.props.children === label)) {
          control = children.find(child => React.isValidElement(child) && ["input", "select"].includes(child.type));
        }
      });
      assert.ok(control, `Control ${label} exists`);
      control.props.onChange({ target: { value } });
    },
  };
}
const empty = calculator();
assert.match(empty.html(), /Preencha os dados para calcular/);
assert.doesNotMatch(empty.html(), /value="(?:72|150|60|80|4\.74|5\.925)"/);
empty.change("K2O", "60");
empty.change("Necessidade (kg/ha)", "72");
assert.match(empty.html(), />120 kg\/ha</);
empty.change("Área do talhão (ha)", "inválida");
assert.match(empty.html(), /Área deve ser/);
assert.doesNotMatch(empty.html(), />120 kg\/ha</);
empty.change("Área do talhão (ha)", "2,5");
assert.match(empty.html(), />0,3 t</);
empty.change("Preço (R$/t)", "inválido");
assert.match(empty.html(), /Preço por tonelada deve ser/);
empty.change("Preço (R$/t)", "1000");
assert.match(empty.html(), /Total R\$.*300,00/);
empty.change("N", "inválida");
assert.match(empty.html(), /Garantia de N deve ser/);
empty.change("N", "");
empty.change("Necessidade (kg/ha)", "inválida");
assert.match(empty.html(), /Alvo de K2O deve ser/);
empty.change("Tipo de cálculo", "PRODUCT_TO_NUTRIENTS");
empty.change("Dose do produto (kg/ha)", "150");
assert.match(empty.html(), />90 kg\/ha</);
assert.match(empty.html(), />0,375 t</);
empty.change("Dose do produto (kg/ha)", "inválida");
assert.match(empty.html(), /Dose do produto deve ser/);

const product = (id, guarantee, extra = {}) => ({ id, code: id, name: id, kind: "FERTILIZER", active: true, guaranteesPercent: guarantee, pricePerTon: 1000, ...extra });
const catalog = calculator([
  product("P", { P2O5: 50 }, { maxRateKgPerHa: 100 }),
  product("K", { K2O: 60 }, { minRateKgPerHa: 130 }),
], { nutrient: "P2O5", targetKgPerHa: 90, areaHa: 10 });
assert.match(catalog.html(), />180 kg\/ha</);
assert.match(catalog.html(), /acima do máximo operacional/);
catalog.change("Tipo de cálculo", "PK_PAIR");
catalog.change("Alvo P2O5 (kg/ha)", "90");
catalog.change("Alvo K2O (kg/ha)", "72");
assert.match(catalog.html(), /Total do produto A no talhão/);
assert.match(catalog.html(), />1,8 t</);
assert.match(catalog.html(), />1,2 t</);
assert.match(catalog.html(), /Diferença 0 kg\/ha/);
assert.match(catalog.html(), /acima do máximo operacional/);
assert.match(catalog.html(), /abaixo do mínimo operacional/);

const lime = calculator([{ id: "LIME", name: "Calcário cadastrado", code: "LIME", kind: "LIMESTONE", active: true, guaranteesPercent: {}, prntPercent: null, pricePerTon: null }]);
lime.change("Tipo de cálculo", "LIME");
assert.match(lime.html(), /não possui PRNT cadastrado/);
lime.change("Fonte do calcário", "MANUAL");
lime.change("PRNT (%)", "80");
lime.change("Preço (R$/t)", "100");
lime.change("Necessidade PRNT100 (t/ha)", "4,74");
lime.change("Área do talhão (ha)", "2");
assert.match(lime.html(), />5,925 t\/ha</);
lime.change("Sentido", "PRODUCT_TO_PRNT100");
lime.change("Dose física aplicada (t/ha)", "5,925");
assert.match(lime.html(), />4,74 t\/ha</);
assert.match(lime.html(), />11,85 t</);
assert.match(lime.html(), /Total R\$.*1\.185,00/);
lime.change("Preço (R$/t)", "-1");
assert.match(lime.html(), /Preço do calcário por tonelada deve ser/);
lime.change("Preço (R$/t)", "100");
lime.change("Área do talhão (ha)", "-2");
assert.match(lime.html(), /Área deve ser/);
lime.change("Área do talhão (ha)", "2");
lime.change("Fonte do calcário", "CATALOG");
assert.match(lime.html(), /não possui PRNT cadastrado/);
assert.doesNotMatch(lime.html(), />4,74 t\/ha</);

const unpriced = calculator([{ id: "L", name: "Sem preço", code: "L", kind: "LIMESTONE", active: true, guaranteesPercent: {}, prntPercent: 80, pricePerTon: null }]);
unpriced.change("Tipo de cálculo", "LIME");
unpriced.change("Fonte do calcário", "MANUAL");
unpriced.change("Preço (R$/t)", "1000");
unpriced.change("Fonte do calcário", "CATALOG");
unpriced.change("Necessidade PRNT100 (t/ha)", "4");
assert.match(unpriced.html(), />5 t\/ha</);
assert.doesNotMatch(unpriced.html(), /R\$/);

const chemical = calculator();
chemical.change("Tipo de cálculo", "CHEMICAL");
assert.match(chemical.html(), /Preencha os dados para calcular/);
chemical.change("Quantidade (kg/ha)", "90");
assert.match(chemical.html(), /Equivalente/);
chemical.change("Quantidade (kg/ha)", "inválida");
assert.match(chemical.html(), /Quantidade a converter deve ser/);
console.log("raiz-calculator-ui: entradas reais, fontes isoladas, limites, totais PK e calcário inverso aprovados");
