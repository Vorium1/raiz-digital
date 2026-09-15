"use client";

import type { AnalysisContextDraft } from "@/domain/analysis-context";
import type { EvidenceStatus } from "@/domain/analysis-depth-readiness";
import { getRequestedAnalysisLayer, type AnalysisDepthId } from "@/domain/analysis-depths";

function EvidenceStatusSelect({
  value,
  onChange,
}: {
  value: EvidenceStatus;
  onChange: (value: EvidenceStatus) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as EvidenceStatus)}>
      <option value="MISSING">Ainda não informei</option>
      <option value="PROVIDED">Tenho / vou informar</option>
      <option value="DECLARED_UNAVAILABLE">Não tenho essa informação</option>
    </select>
  );
}

export function AnalysisContextIntake({
  depthId,
  value,
  onChange,
}: {
  depthId: AnalysisDepthId;
  value: AnalysisContextDraft;
  onChange: (value: AnalysisContextDraft) => void;
}) {
  const requestedLayer = getRequestedAnalysisLayer(depthId) ?? 4;
  const update = (patch: Partial<AnalysisContextDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="form-section">
      <div className="form-heading">
        <span className="eyebrow">CONTEXTO AGRONÔMICO</span>
        <h2>Informe apenas o que este nível precisa.</h2>
        <p>
          A RAIZ reaproveita os dados já cadastrados e não inventa o que estiver faltando. Quando você não tiver uma informação, declare isso explicitamente para que a limitação acompanhe o diagnóstico.
        </p>
      </div>

      {depthId === "personalizada" && (
        <div className="form-grid">
          <label style={{ gridColumn: "1 / -1" }}>
            <span>O que você quer descobrir?</span>
            <textarea
              value={value.objective}
              onChange={(event) => update({ objective: event.target.value })}
              placeholder="Ex.: entender por que a produtividade caiu, revisar a correção do solo ou planejar a próxima soja."
              rows={3}
            />
          </label>
        </div>
      )}

      {requestedLayer === 1 && depthId !== "personalizada" ? (
        <div className="form-note">
          <div>
            <strong>Nenhum formulário adicional é obrigatório neste nível.</strong>
            <small>Envie o laudo na próxima etapa. Profundidade, método e laudos anteriores melhoram a interpretação quando estiverem disponíveis.</small>
          </div>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <label>
              <span>Profundidade da amostragem *</span>
              <input
                value={value.samplingDepthLabel}
                onChange={(event) => update({ samplingDepthLabel: event.target.value })}
                placeholder="Ex.: 0–20 cm"
              />
            </label>
            <label>
              <span>Regime hídrico *</span>
              <select value={value.waterRegime} onChange={(event) => update({ waterRegime: event.target.value as AnalysisContextDraft["waterRegime"] })}>
                <option value="">Selecione</option>
                <option value="SEQUEIRO">Sequeiro</option>
                <option value="IRRIGADO">Irrigado</option>
              </select>
            </label>
            <label>
              <span>Sistema de manejo do solo *</span>
              <input
                value={value.tillageSystem}
                onChange={(event) => update({ tillageSystem: event.target.value })}
                placeholder="Ex.: plantio direto"
              />
            </label>
            <label>
              <span>Histórico de calagem/adubação/gessagem *</span>
              <EvidenceStatusSelect value={value.managementHistoryStatus} onChange={(managementHistoryStatus) => update({ managementHistoryStatus })} />
            </label>
          </div>

          {value.managementHistoryStatus === "PROVIDED" && (
            <label>
              <span>Resumo do manejo recente</span>
              <textarea
                value={value.managementHistoryNotes}
                onChange={(event) => update({ managementHistoryNotes: event.target.value })}
                placeholder="Datas, produtos, doses, coberturas/rotações e qualquer informação relevante. Documentos podem ser vinculados depois."
                rows={3}
              />
            </label>
          )}
        </>
      )}

      {requestedLayer >= 3 && (
        <>
          <div className="form-heading">
            <span className="eyebrow">CAMPO</span>
            <h3>Contexto que muda a interpretação do laudo.</h3>
          </div>
          <div className="form-grid">
            <label style={{ gridColumn: "1 / -1" }}>
              <span>Solo / textura / argila / profundidade efetiva *</span>
              <textarea
                value={value.soilContextNotes}
                onChange={(event) => update({ soilContextNotes: event.target.value })}
                placeholder="Use o que souber. Dados já cadastrados na safra podem aparecer preenchidos automaticamente."
                rows={2}
              />
            </label>
            <label>
              <span>Histórico recente de produtividade *</span>
              <EvidenceStatusSelect value={value.yieldHistoryStatus} onChange={(yieldHistoryStatus) => update({ yieldHistoryStatus })} />
            </label>
            <label>
              <span>Histórico hídrico relevante *</span>
              <EvidenceStatusSelect value={value.waterHistoryStatus} onChange={(waterHistoryStatus) => update({ waterHistoryStatus })} />
            </label>
          </div>
          {value.yieldHistoryStatus === "PROVIDED" && (
            <label>
              <span>Produtividades anteriores</span>
              <textarea value={value.yieldHistoryNotes} onChange={(event) => update({ yieldHistoryNotes: event.target.value })} placeholder="Ex.: soja 2025/26 = 68 sc/ha; milho 2024/25 = 142 sc/ha." rows={2} />
            </label>
          )}
          {value.waterHistoryStatus === "PROVIDED" && (
            <label>
              <span>Seca, excesso de chuva, encharcamento ou irrigação</span>
              <textarea value={value.waterHistoryNotes} onChange={(event) => update({ waterHistoryNotes: event.target.value })} rows={2} />
            </label>
          )}
        </>
      )}

      {requestedLayer >= 4 && (
        <>
          <div className="form-heading">
            <span className="eyebrow">HISTÓRICO E ESPAÇO</span>
            <h3>Dados para o diagnóstico longitudinal e espacial.</h3>
            <p>Georreferenciamento só é obrigatório se você pedir análise espacial/taxa variável. O 360° continua possível sem VRA.</p>
          </div>
          <div className="form-grid">
            <label>
              <span>Histórico de múltiplas safras *</span>
              <EvidenceStatusSelect value={value.multiSeasonHistoryStatus} onChange={(multiSeasonHistoryStatus) => update({ multiSeasonHistoryStatus })} />
            </label>
            <label>
              <span>Clima / meteorologia da safra *</span>
              <EvidenceStatusSelect value={value.weatherContextStatus} onChange={(weatherContextStatus) => update({ weatherContextStatus })} />
            </label>
            <label>
              <span>Quero análise espacial / taxa variável</span>
              <select value={value.spatialRequested ? "YES" : "NO"} onChange={(event) => update({ spatialRequested: event.target.value === "YES", samplesGeoreferenced: event.target.value === "YES" ? value.samplesGeoreferenced : false })}>
                <option value="NO">Não</option>
                <option value="YES">Sim</option>
              </select>
            </label>
            {value.spatialRequested && (
              <label>
                <span>Pontos de amostragem georreferenciados</span>
                <select value={value.samplesGeoreferenced ? "YES" : "NO"} onChange={(event) => update({ samplesGeoreferenced: event.target.value === "YES" })}>
                  <option value="NO">Ainda não / não sei</option>
                  <option value="YES">Sim, com coordenadas confiáveis</option>
                </select>
              </label>
            )}
          </div>
          {value.multiSeasonHistoryStatus === "PROVIDED" && (
            <label>
              <span>Resumo multissafras</span>
              <textarea value={value.multiSeasonHistoryNotes} onChange={(event) => update({ multiSeasonHistoryNotes: event.target.value })} rows={2} />
            </label>
          )}
          {value.weatherContextStatus === "PROVIDED" && (
            <label>
              <span>Eventos meteorológicos relevantes</span>
              <textarea value={value.weatherContextNotes} onChange={(event) => update({ weatherContextNotes: event.target.value })} rows={2} />
            </label>
          )}
        </>
      )}
    </div>
  );
}
