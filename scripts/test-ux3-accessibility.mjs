import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const layout = read("src/app/layout.tsx");
const css = read("src/app/ux3-accessibility.css");

const contextImport = 'import "./ux3-context.css";';
const accessibilityImport = 'import "./ux3-accessibility.css";';

assert.ok(layout.includes(accessibilityImport), "layout deve carregar ux3-accessibility.css");
assert.ok(
  layout.indexOf(accessibilityImport) > layout.indexOf(contextImport),
  "camada de acessibilidade deve ser carregada depois dos demais estilos UX3",
);

for (const root of [
  ".simple-home",
  ".simple-send-page",
  ".simple-field-shell",
  ".simple-analysis-page",
  ".simple-result-page",
]) {
  assert.ok(css.includes(root), `camada de legibilidade deve cobrir ${root}`);
}

assert.match(css, /small\s*\{[\s\S]*?font-size:\s*12px/);
assert.match(css, /button\s*\{[\s\S]*?font-size:\s*13px;[\s\S]*?min-height:\s*44px/);
assert.match(css, /input,[\s\S]*?select,[\s\S]*?textarea\s*\{[\s\S]*?font-size:\s*14px;[\s\S]*?min-height:\s*46px/);
assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?font-size:\s*16px/);
assert.match(css, /\.simple-mobile-nav a\s*\{[\s\S]*?min-height:\s*56px/);
assert.match(css, /\.simple-area-new-menu button[\s\S]*?min-height:\s*44px/);
assert.match(css, /@media print[\s\S]*?\.simple-result-page small[\s\S]*?font-size:\s*10\.5px/);

console.log("ux3 accessibility: legibilidade mínima e alvos de toque protegidos");
