"use client";

import { evaluateIrrigationApplications, MAX_IRRIGATION_APPLICATIONS, type IrrigationApplication } from "@/domain/irrigation-applications";
import styles from "./irrigation-applications-editor.module.css";

const numericFields = [
  ["depthMm", "Lâmina declarada (mm)"], ["volumeM3", "Volume aplicado (m³)"],
  ["irrigatedAreaHa", "Área efetivamente irrigada (ha)"], ["efficiencyPercent", "Eficiência estimada (%)"],
] as const;
const textFields = [
  ["system", "Sistema", "Pivô, aspersão, gotejamento, sulco, inundação…"],
  ["efficiencySource", "Fonte da eficiência", "Ensaio, projeto ou estimativa informada"],
  ["phenologicalStage", "Estádio observado", "Informe somente se conhecido"],
  ["waterAvailabilityNotes", "Disponibilidade de água", "Fonte, restrições ou disponibilidade informada"],
  ["waterQualityNotes", "Qualidade da água", "Parâmetro, valor, unidade, método e data do laudo, se houver"],
  ["evidenceSource", "Origem do registro", "Caderno de campo, medidor, documento…"],
] as const;

export function IrrigationApplicationsEditor({ value, onChange, disabled = false }: {
  value: IrrigationApplication[];
  onChange: (value: IrrigationApplication[]) => void;
  disabled?: boolean;
}) {
  const evidence = evaluateIrrigationApplications(value);
  const update = (id: string, patch: Partial<IrrigationApplication>) => onChange(value.map((item) => item.id === id ? { ...item, ...patch } : item));
  return (
    <details className={styles.container}>
      <summary>Aplicações de irrigação <small>(opcional{value.length ? ` · ${value.length} ${value.length === 1 ? "registro" : "registros"}` : ""})</small></summary>
      <p>Registre somente aplicações realizadas. Datas e quantidades desconhecidas podem ficar em branco. O laudo de solo continua disponível.</p>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {value.map((item, index) => {
          const evaluated = evidence.applications.find((entry) => entry.id === item.id);
          return <fieldset key={item.id} style={{ minWidth: 0, margin: "12px 0", padding: 12 }}>
            <legend>Aplicação {index + 1}</legend>
            <div className="form-grid">
              <label><span>Data local</span><input type="date" value={item.date ?? ""} onChange={(event) => update(item.id, { date: event.target.value || null })}/></label>
              <label><span>Horário local da aplicação</span><input type="time" value={item.time ?? ""} onChange={(event) => update(item.id, { time: event.target.value || null })}/></label>
              <label><span>Deslocamento UTC, se conhecido</span><input value={item.utcOffset ?? ""} maxLength={6} placeholder="Ex.: -03:00" onChange={(event) => update(item.id, { utcOffset: event.target.value || null })}/></label>
              {numericFields.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" step="any" min="0" max={key === "efficiencyPercent" ? 100 : undefined} value={item[key] ?? ""} onChange={(event) => update(item.id, { [key]: event.target.value === "" ? null : Number(event.target.value) })}/></label>)}
              {textFields.map(([key, label, placeholder]) => <label key={key}><span>{label}</span><input value={item[key] ?? ""} maxLength={1000} placeholder={placeholder} onChange={(event) => update(item.id, { [key]: event.target.value || null })}/></label>)}
            </div>
            {evaluated?.depthFromVolumeMm != null && <p>Lâmina equivalente ao volume / área informados: <strong>{evaluated.depthFromVolumeMm.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} mm</strong>. A lâmina declarada é mantida separadamente.</p>}
            <button type="button" onClick={() => onChange(value.filter((entry) => entry.id !== item.id))}>Remover aplicação {index + 1}</button>
          </fieldset>;
        })}
        <button type="button" disabled={value.length >= MAX_IRRIGATION_APPLICATIONS} onClick={() => onChange([...value, {
          id: crypto.randomUUID(), date: null, time: null, utcOffset: null, system: null,
          depthMm: null, volumeM3: null, irrigatedAreaHa: null, efficiencyPercent: null,
          efficiencySource: null, phenologicalStage: null, waterAvailabilityNotes: null,
          waterQualityNotes: null, evidenceSource: null,
        }])}>Adicionar aplicação realizada</button>
      </fieldset>
      {evidence.status === "INVALID_OPTIONAL_EVIDENCE" && <p role="alert">{evidence.limitations[0]}</p>}
      <p><small>Volume / área é uma conversão de unidades. Chuva, evapotranspiração, armazenamento e perdas ainda precisam ser compatíveis para calcular um balanço hídrico. Estes registros não alteram doses de fertilizante.</small></p>
    </details>
  );
}
