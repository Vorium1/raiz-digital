import { humanClassification } from "@/domain/simple-ux-labels";
import type { PublishedParameterDashboardRow } from "@/domain/published-result-dashboard";

const PARAMETER_LABEL: Record<string, string> = {
  PH: "pH",
  P: "Fósforo",
  K: "Potássio",
  CA: "Cálcio",
  MG: "Magnésio",
  AL: "Alumínio",
  H_AL: "Acidez potencial",
  V: "Saturação por bases",
  MO: "Matéria orgânica",
  CTC: "CTC",
  CTC_PH7: "CTC pH 7",
  CLAY: "Argila",
  SMP: "Índice SMP",
  S: "Enxofre",
  B: "Boro",
  ZN: "Zinco",
  CU: "Cobre",
  MN: "Manganês",
  FE: "Ferro",
  MOLIBDENIO: "Molibdênio",
  MO_ELEMENT: "Molibdênio",
};

function parameterLabel(code: string) {
  return PARAMETER_LABEL[code] ?? code.replaceAll("_", " ");
}

function compactNumber(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function classificationTone(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["VERY_LOW", "MUITO_BAIXO", "LOW", "BAIXO", "DEFICIENT", "DEFICIENTE", "CRITICAL", "CRITICO", "CRÍTICO"].includes(normalized)) return "low";
  if (["MEDIUM", "MEDIO", "MÉDIO", "ADEQUATE", "ADEQUADO", "SUFFICIENT", "SUFICIENTE", "OPTIMAL", "OTIMO", "ÓTIMO"].includes(normalized)) return "ok";
  if (["HIGH", "ALTO", "VERY_HIGH", "MUITO_ALTO"].includes(normalized)) return "high";
  if (["TOXIC", "TOXICO", "TÓXICO"].includes(normalized)) return "critical";
  return "neutral";
}

export function PublishedParameterDashboard({ rows }: { rows: PublishedParameterDashboardRow[] }) {
  if (!rows.length) return null;

  return (
    <div className="report-v4-parameter-grid" aria-label="Interpretação visual dos parâmetros do solo">
      {rows.map((row) => {
        const distributionTotal = row.classifiedCount + row.unclassifiedCount;
        const valueLabel = row.mixedUnits
          ? "Unidades diferentes"
          : row.mean != null
            ? compactNumber(row.mean) + (row.unit ? " " + row.unit : "")
            : "Sem valor consolidado";

        return (
          <article className="report-v4-parameter-card" key={row.parameterCode}>
            <div className="report-v4-parameter-head">
              <div>
                <small>{row.parameterCode}</small>
                <strong>{parameterLabel(row.parameterCode)}</strong>
              </div>
              <b>{valueLabel}</b>
            </div>

            {row.mean != null && row.min != null && row.max != null && !row.mixedUnits && (
              <div className="report-v4-range">
                <span>mín. {compactNumber(row.min)}</span>
                <span>média {compactNumber(row.mean)}</span>
                <span>máx. {compactNumber(row.max)}</span>
              </div>
            )}

            <div className="report-v4-class-bar" aria-label={"Distribuição das classificações de " + parameterLabel(row.parameterCode)}>
              {row.classificationCounts.map((item) => (
                <i
                  key={item.classification}
                  data-tone={classificationTone(item.classification)}
                  style={{ width: distributionTotal > 0 ? String((item.count / distributionTotal) * 100) + "%" : "0%" }}
                  title={humanClassification(item.classification) + ": " + item.count}
                />
              ))}
              {row.unclassifiedCount > 0 && (
                <i
                  data-tone="unclassified"
                  style={{ width: distributionTotal > 0 ? String((row.unclassifiedCount / distributionTotal) * 100) + "%" : "100%" }}
                  title={"Sem classificação: " + row.unclassifiedCount}
                />
              )}
            </div>

            <div className="report-v4-class-legend">
              {row.classificationCounts.map((item) => (
                <span key={item.classification}>
                  <i data-tone={classificationTone(item.classification)} />
                  {item.count} {humanClassification(item.classification).toLowerCase()}
                </span>
              ))}
              {row.unclassifiedCount > 0 && <span><i data-tone="unclassified"/>{row.unclassifiedCount} sem classificação</span>}
            </div>

            <footer>
              <span>{row.sampleCount} ponto{row.sampleCount === 1 ? "" : "s"}</span>
              {row.methods.length > 0 && <span>{row.methods.slice(0, 2).join(" · ")}</span>}
            </footer>

            {row.classifiedCount === 0 && row.reasons.length > 0 && (
              <p className="report-v4-parameter-note">{row.reasons[0]}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
