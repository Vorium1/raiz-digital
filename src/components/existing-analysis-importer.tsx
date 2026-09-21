"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { LabImporter } from "@/components/lab-importer";
import type { LabImportPreview, LabSampleType } from "@/domain/lab-import";

type PreviewWithCounts = LabImportPreview & {
  normalizedRowCount?: number;
  issueCount?: number;
};

type Props = {
  analysisId: string;
  analysisCode: string;
  clientName: string;
  propertyName: string;
  fieldName: string;
  seasonLabel: string;
  laboratoryName?: string | null;
  hasAgronomicContext: boolean;
};

export function ExistingAnalysisImporter({
  analysisId,
  analysisCode,
  clientName,
  propertyName,
  fieldName,
  seasonLabel,
  laboratoryName,
  hasAgronomicContext,
}: Props) {
  const router = useRouter();
  const [method, setMethod] = useState("Mehlich-1");
  const [sampleType, setSampleType] = useState<LabSampleType>("SOLO");
  const [preview, setPreview] = useState<PreviewWithCounts | null>(null);
  const [importFile, setImportFile] = useState<{ fileName: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalRows = preview?.normalizedRowCount ?? preview?.rows.length ?? 0;

  async function commit() {
    if (!importFile || !preview) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId,
          content: importFile.content,
          fileName: importFile.fileName,
          fallbackMethod: method || undefined,
          hasAgronomicContext,
          sampleType,
          // Vínculo espacial nunca é inferido pela tela de upload. Só proveniência persistida pode liberá-lo.
          spatialLinked: false,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar o laudo nesta análise.");
      router.push(`/analises/${analysisId}`);
      router.refresh();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Não foi possível registrar o laudo nesta análise.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wizard-shell">
      <section className="card wizard-card">
        <div className="form-section">
          <div className="form-heading">
            <span className="eyebrow">ANÁLISE EXISTENTE · {analysisCode}</span>
            <h2>Importar laudo sem criar outra análise</h2>
            <p>O arquivo será vinculado diretamente a esta análise. A RAIZ preserva o original antes da leitura e mantém a conferência humana da fonte como etapa separada.</p>
          </div>

          <div className="review-grid">
            <div className="review-summary"><span>Cliente</span><strong>{clientName}</strong><small>{propertyName}</small></div>
            <div className="review-summary"><span>Talhão</span><strong>{fieldName}</strong><small>Safra {seasonLabel}</small></div>
            <div className="review-summary"><span>Laboratório</span><strong>{laboratoryName || "Não identificado"}</strong><small>Cadastro atual da análise</small></div>
            <div className="review-summary"><span>Contexto</span><strong>{hasAgronomicContext ? "Agronômico disponível" : "Parcial"}</strong><small>Não altera o vínculo espacial</small></div>
          </div>

          <div className="import-options">
            <div>
              <Icon name="layers" />
              <span>
                <strong>Extrator principal P/K</strong>
                <select value={method} onChange={(event) => setMethod(event.target.value)} disabled={saving}>
                  <option value="">Não informado</option>
                  <option>Mehlich-1</option>
                  <option>Resina</option>
                  <option>KCl 1 mol/L</option>
                  <option>Acetato de cálcio</option>
                </select>
              </span>
            </div>
            <div>
              <Icon name="database" />
              <span>
                <strong>Tipo de amostra</strong>
                <select value={sampleType} onChange={(event) => setSampleType(event.target.value as LabSampleType)} disabled={saving}>
                  <option value="SOLO">Solo</option>
                  <option value="BIOLOGICO">Biológico / microbiologia / raiz</option>
                  <option value="FOLIAR">Foliar</option>
                  <option value="PECIOLO">Pecíolo</option>
                  <option value="MASSA_SECA">Massa seca</option>
                  <option value="GRAO">Grão</option>
                  <option value="SEMENTE">Semente</option>
                  <option value="FERTILIZANTE">Fertilizante</option>
                </select>
              </span>
            </div>
          </div>

          <LabImporter
            method={method}
            onPreviewChange={(value) => setPreview(value as PreviewWithCounts | null)}
            onFileReady={setImportFile}
          />

          {preview && (
            <div className={`workflow-decision ${preview.blockers > 0 ? "attention" : ""}`}>
              <Icon name={preview.blockers > 0 ? "warning" : "shield"} size={19} />
              <div>
                <span>Pré-validação</span>
                <strong>{totalRows} resultado(s) · {preview.sampleCount} amostra(s)</strong>
                <small>{preview.blockers > 0 ? `${preview.blockers} bloqueio(s). O arquivo será registrado como inconsistente e não será tratado como evidência válida até correção.` : "Sem bloqueios estruturais. A fonte original ainda exige conferência humana antes da entrega oficial."}</small>
              </div>
            </div>
          )}

          {error && <div className="import-message danger"><Icon name="warning" /><div><strong>Importação não concluída</strong><small>{error}</small></div></div>}
        </div>

        <footer className="wizard-footer">
          <button type="button" className="button ghost" disabled={saving} onClick={() => router.push(`/analises/${analysisId}`)}>Cancelar</button>
          <div>
            <span>{preview ? `${totalRows} resultado(s) lido(s)` : "Selecione um laudo"}</span>
            <button type="button" className="button primary" disabled={saving || !preview || !importFile} onClick={() => void commit()}>
              {saving ? "Registrando…" : "Registrar nesta análise"}<Icon name="arrow" size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
