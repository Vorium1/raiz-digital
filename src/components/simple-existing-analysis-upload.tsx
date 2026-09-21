"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { LabImporter, type LabImporterReadyFile } from "@/components/lab-importer";
import type { LabImportPreview, LabImportUsability, LabSampleType } from "@/domain/lab-import";

type ImportPreview = LabImportPreview & { normalizedRowCount?: number; usability?: LabImportUsability };

export function SimpleExistingAnalysisUpload({ analysisId, hasAgronomicContext }: { analysisId: string; hasAgronomicContext: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState("");
  const [sampleType, setSampleType] = useState<LabSampleType>("SOLO");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<LabImporterReadyFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = Boolean(preview && file && (preview.usability?.canProceedWithPartialEvidence ?? preview.blockers === 0));
  const rowCount = preview?.normalizedRowCount ?? preview?.rows.length ?? 0;

  async function submit() {
    if (!file || !ready) return;
    setBusy(true);
    setError("");
    try {
      const commitResponse = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId,
          content: file.content,
          fileName: file.fileName,
          fallbackMethod: method || undefined,
          hasAgronomicContext,
          sampleType,
          spatialLinked: false,
        }),
      });
      const commitPayload = await commitResponse.json().catch(() => ({}));
      if (!commitResponse.ok) throw new Error(commitPayload.error ?? "O arquivo não pôde ser salvo.");

      const interpretationResponse = await fetch(`/api/analyses/${analysisId}/interpret`, { method: "POST" });
      const interpretationPayload = await interpretationResponse.json().catch(() => ({}));
      if (!interpretationResponse.ok && interpretationPayload.error) {
        sessionStorage.setItem(`raiz:ux3:auto:${analysisId}`, String(interpretationPayload.error));
      }

      router.push(`/analise/${analysisId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar estes dados.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="simple-send-flow existing-analysis-upload">
      <section className="simple-send-block">
        <div className="simple-send-number">1</div>
        <div className="simple-send-content">
          <div className="simple-send-heading"><span>ARQUIVO</span><h2>Escolha o laudo</h2><p>A RAIZ lê, organiza e continua esta análise.</p></div>
          <LabImporter simple method={method} onPreviewChange={(value) => setPreview(value as ImportPreview | null)} onFileReady={setFile}/>
          {ready && <div className="simple-send-ok"><Icon name="check" size={18}/><div><strong>{preview?.blockers ? "Arquivo recebido com evidências utilizáveis" : "Arquivo recebido"}</strong><small>{file?.fileName} · {preview?.usability ? `${preview.usability.promotableRowCount} resultado(s) utilizável(is)${preview.usability.excludedRowCount ? ` · ${preview.usability.excludedRowCount} linha(s) ficará(ão) fora da interpretação` : ""}` : `${rowCount} resultado(s) reconhecido(s)`}</small></div></div>}
          <details className="simple-send-options">
            <summary>Opções do arquivo</summary>
            <div className="single">
              <label>
                Método, somente se estiver faltando no arquivo
                <select value={method} onChange={(event) => setMethod(event.target.value)}>
                  <option value="">Não assumir</option>
                  <option>Mehlich-1</option>
                  <option>Resina</option>
                  <option>KCl 1 mol/L</option>
                  <option>Acetato de cálcio</option>
                </select>
              </label>
              <label>
                Tipo de amostra
                <select value={sampleType} onChange={(event) => setSampleType(event.target.value as LabSampleType)}>
                  <option value="SOLO">Solo</option>
                  <option value="BIOLOGICO">Biológico / microbiologia / raiz</option>
                  <option value="FOLIAR">Foliar</option>
                  <option value="PECIOLO">Pecíolo</option>
                  <option value="MASSA_SECA">Massa seca</option>
                  <option value="GRAO">Grão</option>
                  <option value="SEMENTE">Semente</option>
                  <option value="FERTILIZANTE">Fertilizante</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      </section>

      {error && <div className="simple-send-error final"><Icon name="warning" size={17}/><span>{error}</span></div>}

      <div className="simple-send-finish">
        <div><strong>Pronto.</strong><small>Depois do envio, a RAIZ tenta analisar automaticamente.</small></div>
        <button type="button" disabled={!ready || busy} onClick={() => void submit()}>{busy ? "Analisando…" : "Enviar e analisar"}<Icon name="arrow" size={16}/></button>
      </div>
    </div>
  );
}
