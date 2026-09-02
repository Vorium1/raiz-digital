"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { LabImportPreview } from "@/domain/lab-import";

type Props = {
  method: string;
  onPreviewChange: (preview: LabImportPreview | null) => void;
  onFileReady?: (file: { fileName: string; content: string } | null) => void;
};

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

const levelLabel: Record<LabImportPreview["confidence"]["level"], string> = {
  HIGH: "Alta",
  ADEQUATE: "Adequada",
  LIMITED: "Limitada",
  INSUFFICIENT: "Insuficiente",
};

export function LabImporter({ method, onPreviewChange, onFileReady }: Props) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<LabImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleIssues = useMemo(() => preview?.issues.slice(0, 6) ?? [], [preview]);

  async function processFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    onPreviewChange(null);
    onFileReady?.(null);
    setError("");

    const extension = file.name.split(".").pop()?.toLowerCase();
    const isSpreadsheet = extension === "xlsx" || extension === "xls";
    if (!extension || !["csv", "txt", "xlsx", "xls"].includes(extension)) {
      setError("Nesta versão funcional, use CSV ou XLSX. PDF ainda não é suportado.");
      return;
    }
    const maxSize = isSpreadsheet ? 4_500_000 : 3_500_000;
    if (file.size > maxSize) {
      setError(`O arquivo excede ${(maxSize / 1_000_000).toLocaleString("pt-BR")} MB. Divida por área ou laboratório nesta etapa do MVP.`);
      return;
    }

    setLoading(true);
    try {
      const content = isSpreadsheet ? await readAsBase64(file) : await file.text();
      const response = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          fileName: file.name,
          fallbackMethod: method || undefined,
          hasAgronomicContext: true,
          spatialLinked: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao validar o arquivo.");
      setPreview(payload as LabImportPreview);
      onPreviewChange(payload as LabImportPreview);
      onFileReady?.({ fileName: file.name, content });
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : "Não foi possível processar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lab-importer">
      <label className={`upload-zone ${preview ? "has-file" : ""} ${error ? "has-error" : ""}`}>
        <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={(event) => void processFile(event.target.files?.[0])}/>
        <div className="upload-icon"><Icon name={preview ? "check" : loading ? "clock" : "upload"} size={27}/></div>
        <strong>{loading ? "Validando estrutura e resultados…" : fileName || "Arraste o laudo CSV/XLSX ou clique para selecionar"}</strong>
        <small>{preview ? `${preview.rows.length} resultados normalizados · ${preview.sampleCount} amostras` : "CSV ou XLSX · primeira aba da planilha · PDF ainda não suportado"}</small>
      </label>

      {error && <div className="import-message danger"><Icon name="warning" size={18}/><div><strong>Arquivo não processado</strong><small>{error}</small></div></div>}

      {preview && <div className="import-preview">
        <div className="import-preview-head">
          <div>
            <span className="eyebrow">PRÉ-VALIDAÇÃO REAL</span>
            <h3>{preview.blockers ? "Há bloqueios para interpretação" : "Arquivo pronto para conferência"}</h3>
            <p>O arquivo já foi lido, normalizado e validado no servidor. Nenhuma recomendação agronômica é publicada nesta etapa.</p>
          </div>
          <div className={`confidence-orb ${preview.confidence.level.toLowerCase()}`}>
            <strong>{preview.confidence.score}</strong><span>/100</span><small>{levelLabel[preview.confidence.level]}</small>
          </div>
        </div>

        <div className="import-stats">
          <article><span>Formato detectado</span><strong>{preview.format === "LONG" ? "Tabela longa" : "Tabela ampla"}</strong></article>
          <article><span>Amostras</span><strong>{preview.sampleCount}</strong></article>
          <article><span>Parâmetros</span><strong>{preview.parameterCount}</strong></article>
          <article><span>Bloqueios</span><strong className={preview.blockers ? "danger-text" : "success-text"}>{preview.blockers}</strong></article>
        </div>

        <div className="parameter-chips">{preview.parameters.slice(0, 14).map((parameter) => <span key={parameter}>{parameter}</span>)}</div>

        <div className="import-table-wrap">
          <table className="import-table">
            <thead><tr><th>Amostra</th><th>Parâmetro</th><th>Valor</th><th>Unidade</th><th>Método</th></tr></thead>
            <tbody>{preview.rows.slice(0, 6).map((row, index) => <tr key={`${row.sampleCode}-${row.parameterCode}-${index}`}><td>{row.sampleCode}</td><td>{row.parameterCode}</td><td>{row.value.toLocaleString("pt-BR")}</td><td>{row.unit}{row.unitInferred ? <sup>*</sup> : null}</td><td>{row.method}{row.methodInferred ? <sup>*</sup> : null}</td></tr>)}</tbody>
          </table>
        </div>

        {visibleIssues.length > 0 && <div className="import-issues">
          {visibleIssues.map((issue, index) => <div key={`${issue.code}-${issue.line ?? 0}-${index}`} className={issue.severity === "BLOCKER" ? "blocker" : "warning"}><Icon name={issue.severity === "BLOCKER" ? "warning" : "shield"} size={15}/><span><strong>{issue.severity === "BLOCKER" ? "Bloqueio" : "Conferir"}{issue.line ? ` · linha ${issue.line}` : ""}</strong><small>{issue.message}</small></span></div>)}
          {preview.issues.length > visibleIssues.length && <small className="more-issues">+ {preview.issues.length - visibleIssues.length} ocorrências adicionais</small>}
        </div>}

        <div className="human-check-note"><Icon name="shield" size={17}/><span><strong>Conferência humana obrigatória</strong><small>Unidades ou métodos inferidos aparecem com *. O agrônomo deve validar antes do motor técnico usar estes dados.</small></span></div>
      </div>}
    </div>
  );
}
