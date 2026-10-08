import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const report=readFileSync(
  new URL("../src/app/(platform)/planejamento/[id]/relatorio/[snapshotId]/page.tsx",import.meta.url),
  "utf8",
);
const commercialRepository=readFileSync(
  new URL("../src/lib/repositories/planning-commercial.ts",import.meta.url),
  "utf8",
);
const editor=readFileSync(
  new URL("../src/components/planning-scenario-editor.tsx",import.meta.url),
  "utf8",
);

assert.match(
  report,
  /getPlanningSnapshot/,
  "relatório deve usar snapshot agronômico persistido",
);
assert.doesNotMatch(
  report,
  /calculatePlanningScenario|getPlanningCalculationPreview/,
  "abrir relatório não pode recalcular o planejamento",
);
assert.match(
  report,
  /snapshot\.integrity==="VERIFIED"/,
  "exportação PDF precisa depender da integridade verificada do snapshot",
);
assert.match(
  report,
  /listPlanningCommercialSnapshotsForPlanningSnapshot/,
  "cenários comerciais precisam ser lidos por versão congelada do planejamento",
);
assert.match(
  commercialRepository,
  /created_at<=\$3::timestamptz/,
  "relatório não pode incluir cenário comercial criado depois do snapshot agronômico",
);
assert.match(
  commercialRepository,
  /source_scenario_updated_at=\$4::timestamptz/,
  "cenário comercial precisa corresponder à mesma versão do cenário",
);
assert.match(
  commercialRepository,
  /cropVersions\.get\(String\(row\.planningCropId\)\)/,
  "versão do cultivo comercial precisa corresponder ao cultivo congelado",
);
assert.match(
  report,
  /Alternativas comerciais são exibidas lado a lado/,
  "relatório não pode escolher produto ou fornecedor automaticamente",
);
assert.match(
  report,
  /O acumulado soma apenas parcelas calculadas pelas regras homologadas/,
  "relatório não pode completar bloqueios com zero ou média",
);
assert.match(
  report,
  /A previsão CPTEC de 7 dias não é extrapolada para safras futuras/,
  "relatório precisa declarar a lacuna climática sem inventar previsão futura",
);
assert.match(
  report,
  /Classificação analítica não é convertida em dose automática/,
  "micronutriente classificado não pode virar dose no relatório",
);
assert.match(
  report,
  /SHA-256/,
  "relatório precisa expor hash de rastreabilidade",
);
assert.match(
  report,
  /não substitui a prescrição oficial de cada safra/,
  "planejamento precisa permanecer separado do laudo oficial mono-safra",
);
assert.match(
  editor,
  /Relatório \/ PDF/,
  "cada snapshot precisa oferecer acesso ao documento reproduzível",
);
assert.match(
  editor,
  /\/planejamento\/\$\{scenario\.id\}\/relatorio\/\$\{snapshot\.id\}/,
  "link do relatório deve fixar cenário e snapshot",
);

console.log("multiseason-report: snapshot imutável, comércio versionado, clima fail-closed e PDF separados do laudo oficial");
