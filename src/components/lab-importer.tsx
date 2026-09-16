"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { LabImportPreview } from "@/domain/lab-import";
import { jsonTransportBytes, LAB_UPLOAD_LIMITS } from "@/domain/lab-upload-limits";

type Props = {
  method: string;
  onPreviewChange: (preview: LabImportPreview | null) => void;
  onFileReady?: (file: { fileName: string; content: string } | null) => void;
};

type PreviewWithSource = LabImportPreview & {
  aiExtracted?: boolean;
  csvContent?: string;
  transportContent?: string;
  sourceArchived?: boolean;
  normalizedRowCount?: number;
  issueCount?: number;
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MIME_BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

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

function serializedBody(payload: unknown) {
  if (jsonTransportBytes(payload) > LAB_UPLOAD_LIMITS.functionPayloadBytes) {
    throw new Error("O arquivo excede o limite de transporte do ambiente atual. Divida o laudo por área ou laboratório.");
  }
  return JSON.stringify(payload);
}

const levelLabel: Record<LabImportPreview["confidence"]["level"], string> = {
  HIGH: "Alta",
  ADEQUATE: "Adequada",
  LIMITED: "Limitada",
  INSUFFICIENT: "Insuficiente",
};

export function LabImporter({ method, onPreviewChange, onFileReady }: Props) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewWithSource | null>(null);
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
    const isImageOrPdf = extension === "pdf" || IMAGE_EXTENSIONS.has(extension ?? "");
    if (!extension || !["csv", "txt", "xlsx", "xls", "pdf", "jpg", "jpeg", "png", "webp"].includes(extension)) {
      setError("Formatos aceitos: CSV, XLSX, PDF, JPG, PNG ou WEBP.");
      return;
    }
    const maxSize = isImageOrPdf
      ? LAB_UPLOAD_LIMITS.imageOrPdfBytes
      : isSpreadsheet
        ? LAB_UPLOAD_LIMITS.spreadsheetBytes
        : LAB_UPLOAD_LIMITS.textBytes;
    if (file.size > maxSize) {
      setError(`O arquivo excede ${(maxSize / 1_000_000).toLocaleString("pt-BR")} MB. Divida por área ou laboratório nesta etapa do MVP.`);
      return;
    }

    setLoading(true);
    try {
      if (isImageOrPdf) {
        const content = await readAsBase64(file);
        const requestPayload = { content, mimeType: file.type || MIME_BY_EXTENSION[extension], fileName: file.name, fallbackMethod: method || undefined };
        const response = await fetch("/api/import/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: serializedBody(requestPayload),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Falha ao ler o arquivo com IA.");
        setPreview(payload as PreviewWithSource);
        onPreviewChange(payload as LabImportPreview);
        onFileReady?.({ fileName: `${file.name.replace(/\.[^.]+$/, "")}.csv`, content: (payload as PreviewWithSource).csvContent ?? "" });
        return;
      }

      const content = isSpreadsheet ? await readAsBase64(file) : await file.text();
      const requestPayload = {
        content,
        fileName: file.name,
        fallbackMethod: method || undefined,
        hasAgronomicContext: true,
        spatialLinked: true,
      };
      const response = await fetch("/api/import/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: serializedBody(requestPayload),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha ao validar o arquivo.");
      setPreview(payload as PreviewWithSource);
      onPreviewChange(payload as LabImportPreview);
      onFileReady?.({ fileName: file.name, content: (payload as PreviewWithSource).transportContent ?? content });
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : "Não foi possível processar o arquivo.");
    } finally {
      setLoading(false);
    }
  }

  const normalizedRowCount = preview?.normalizedRowCount ?? preview?.rows.length ?? 0;
  const totalIssueCount = preview?.issueCount ?? preview?.issues.length ?? 0;

  return (
    <div className="lab-importer">
      <label className={`upload-zone ${preview ? "has-file" : ""} ${error ? "has-error" : ""}`}>
        <input type="file" accept=".csv,.txt,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => void processFile(event.target.files?.[0])}/>
        <div className="upload-icon"><Icon name={preview ? "check" : loading ? "clock" : "upload"} size={27}/></div>
        <strong>{loading ? (preview === null && fileName ? "Lendo o laudo…" : "Validando estrutura e resultados…") : fileName || "Arraste o laudo (CSV, XLSX, PDF ou foto) ou clique para selecionar"}</strong>
        <small>{preview ? `${normalizedRowCount} resultados normalizados · ${preview.sampleCount} amostras` : "CSV/XLSX (leitura exata) ou PDF/foto (leitura por IA, com conferência obrigatória)"}</small>
      </label>

      {error && <div className="import-message danger"><Icon name="warning" size={18}/><div><strong>Arquivo não processado</strong><small>{error}</small></div></div>}

      {preview?.aiExtracted && <div className="import-message review"><Icon name="sparkles" size={18}/><div><strong>Transcrito por IA a partir do arquivo enviado</strong><small>O original já foi arquivado antes da leitura automática. Revise o preview e, após criar a análise, abra o arquivo original no painel de proveniência para fazer a conferência humana antes da entrega oficial.</small></div></div>}

      {preview && <div className="import-preview">
        <div className="import-preview-head">
          <div>
            <span className="eyebrow">PRÉ-VALIDAÇÃO REAL</span>
            <h3>{preview.blockers ? "Há bloqueios para interpretação" : "Arquivo pronto para conferência"}</h3>
            <p>O original foi preservado antes desta leitura em modo real. Os dados abaixo foram normalizados e validados no servidor; nenhuma recomendação agronômica é publicada nesta etapa.</p>
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
          {totalIssueCount > visibleIssues.length && <small className="more-issues">+ {totalIssueCount - visibleIssues.length} ocorrências adicionais</small>}
        </div>}

        <div className="human-check-note"><Icon name="shield" size={17}/><span><strong>Conferência humana obrigatória</strong><small>Unidades ou métodos inferidos aparecem com *. O agrônomo deve validar a fonte original no painel de proveniência antes da entrega oficial.</small></span></div>
      </div>}
    </div>
  );
}
