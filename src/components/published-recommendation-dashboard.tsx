import type { PublishedRecommendationGroup } from "@/domain/published-recommendation-dashboard";
import { producerFacingRecommendationText } from "@/domain/recommendation-display";

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

export function PublishedRecommendationDashboard({
  groups,
  areaHa,
}: {
  groups: PublishedRecommendationGroup[];
  areaHa: number;
}) {
  return (
    <div className="report-v4-recommendation-dashboard">
      {groups.map((group) => (
        <section
          key={group.category}
          className="report-v4-recommendation-group"
          data-recommendation-category={group.category.toLowerCase()}
        >
          <header>
            <span className="report-v4-recommendation-category-dot" aria-hidden="true"/>
            <div>
              <strong>{group.label}</strong>
              <small>{group.hint}</small>
            </div>
            <b>{group.rows.length}</b>
          </header>

          <div className="report-v4-recommendation-grid">
            {group.rows.map((row, index) => {
              const rationale = producerFacingRecommendationText(row.rationale);
              return (
                <article key={`${row.inputType}-${index}`} className="report-v4-recommendation-card">
                  <div className="report-v4-recommendation-card-head">
                    <strong>{row.label}</strong>
                    <span>APROVADO</span>
                  </div>

                  <div className="report-v4-recommendation-dose">
                    <div>
                      <small>Dose</small>
                      <b>{formatNumber(row.doseQuantity, 4)} {row.doseUnit}</b>
                    </div>
                    <div>
                      <small>Total para {formatNumber(areaHa)} ha</small>
                      <b>
                        {row.totalQuantity != null && row.totalUnit
                          ? `${formatNumber(row.totalQuantity, 4)} ${row.totalUnit}`
                          : "Conforme dose aprovada"}
                      </b>
                    </div>
                  </div>

                  {rationale && (
                    <p className="report-v4-recommendation-rationale">
                      <strong>Por quê:</strong> {rationale}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
