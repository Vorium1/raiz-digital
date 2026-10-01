"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FieldTimeline, TimelineCategory, TimelineEvent } from "@/domain/field-timeline";
import { selectTimelineEvents, timelineCalendarDay } from "@/domain/field-timeline-filters";
import styles from "./field-decision-timeline.module.css";

const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  SEASON: "Safra", COLLECTION: "Coleta", LAB: "Laboratório", RULE: "Regra",
  DECISION: "Decisão", DELIVERY: "Entrega", FOLLOWUP: "Acompanhamento",
};

const SOURCE_LABELS: Record<string, string> = {
  crop_season: "Safra", collection_order: "Ordem de coleta", sample_point: "Ponto de coleta",
  analysis: "Análise", analysis_import: "Importação laboratorial", analysis_source_verification: "Conferência da fonte",
  interpretation: "Interpretação", agronomic_rule_execution: "Execução de regra", source_snapshot: "Referência de fonte",
  ai_generation: "Prescrição", report: "Publicação de relatório", input_recommendation: "Recomendação",
  commercial_plan_snapshot: "Cenário comercial", input_application: "Aplicação", field_yield_history: "Produtividade",
  field_ndvi_snapshot: "Leitura de satélite", audit_event: "Evento de auditoria",
};

function sourceLabel(entityType: string) {
  return SOURCE_LABELS[entityType] || entityType;
}

function displayDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")
    : new Date(value).toLocaleString("pt-BR");
}

function TimelineRecord({ event, seasonLabel }: { event: TimelineEvent; seasonLabel: string | null }) {
  const isDecision = event.category === "DECISION" || event.category === "RULE";
  return <article className={styles.event} aria-label={event.title}>
    <div className={styles.eventHeader}>
      <span className={styles.category} data-category={event.category}>{CATEGORY_LABELS[event.category]}</span>
      <time dateTime={event.occurredAt}>{event.dateBasis === "REGISTERED" ? "Registrado em " : "Evento em "}{displayDate(event.occurredAt)}</time>
    </div>
    <h3>{event.title}</h3>
    <p>{event.detail}</p>
    <p className={styles.scope}>{event.seasonId ? `Safra: ${seasonLabel || "Vínculo registrado; nome indisponível"}` : "Histórico do talhão · sem vínculo de safra"}</p>
    <dl className={styles.details}>
      <div><dt>Responsável</dt><dd>{event.responsibleName || "Não registrado"}</dd></div>
      {(event.rule || isDecision) && <>
        <div><dt>Regra</dt><dd>{event.rule?.code || "Não registrada neste evento"}</dd></div>
        <div><dt>Versão</dt><dd>{event.rule?.version || "Não registrada"}</dd></div>
        <div className={styles.hash}><dt>Hash da regra</dt><dd>{event.rule?.hash || "Não registrado"}</dd></div>
      </>}
    </dl>
    <div className={styles.sources}>
      <div><strong>Origem · {sourceLabel(event.source.entityType)}</strong><code>ID: {event.source.id}</code><Link href={event.source.href}>Abrir contexto do registro</Link></div>
      {event.evidenceRefs.map((evidence) => <div key={`${evidence.entityType}:${evidence.id}:${evidence.href}`}><strong>{evidence.label} · {sourceLabel(evidence.entityType)}</strong><code>ID: {evidence.id}</code><Link href={evidence.href}>Abrir contexto da referência</Link></div>)}
    </div>
    {isDecision && event.evidenceRefs.length === 0 && <p className={styles.limitation}>Evidências vinculadas não registradas neste evento.</p>}
    {event.limitations.length > 0 && <div className={styles.limitations}><strong>Limitações do registro</strong><ul>{event.limitations.map((limitation, index) => <li key={`${index}:${limitation}`}>{limitation}</li>)}</ul></div>}
  </article>;
}

/** Mounted only when the parent timeline tab opens; the request follows that lifecycle. */
export function FieldDecisionTimeline({ fieldId, seasonId }: { fieldId: string; seasonId?: string }) {
  const [data, setData] = useState<FieldTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [category, setCategory] = useState<TimelineCategory | "ALL">("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    async function load() {
      try {
        const response = await fetch(`/api/fields/${encodeURIComponent(fieldId)}/timeline`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar o histórico do talhão.");
        const payload = await response.json() as FieldTimeline;
        if (controller.signal.aborted) return;
        if (payload.fieldId !== fieldId || !Array.isArray(payload.events) || !Array.isArray(payload.seasons)) {
          throw new Error("O histórico recebido não corresponde ao talhão.");
        }
        setData(payload);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Falha ao carregar o histórico do talhão.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [fieldId, retry]);

  const invalidPeriod = Boolean(fromDate && toDate && fromDate > toDate);
  const { groups, filterError } = useMemo(() => {
    if (!data || invalidPeriod) return { groups: [], filterError: null };
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const events = selectTimelineEvents(data.events, { category, seasonId, fromDate, toDate, timeZone });
      const byDay = new Map<string, TimelineEvent[]>();
      for (const event of events) {
        const day = timelineCalendarDay(event.occurredAt, timeZone)!;
        const existing = byDay.get(day);
        if (existing) existing.push(event);
        else byDay.set(day, [event]);
      }
      const groups = [...byDay.entries()].sort(([left], [right]) => right.localeCompare(left))
        .map(([day, dayEvents]) => ({ day, events: dayEvents }));
      return { groups, filterError: null };
    } catch (failure) {
      return { groups: [], filterError: failure instanceof Error ? failure.message : "Não foi possível filtrar o histórico." };
    }
  }, [data, category, seasonId, fromDate, toDate, invalidPeriod]);

  return <section className={`card ${styles.timeline}`} aria-label="Reconstrução da decisão agronômica">
    <header className={styles.heading}><div><span className="eyebrow">LINHA DO TEMPO</span><h2>Da evidência à decisão</h2><p>Registros de coleta, laboratório, regras, decisões e entregas, com suas fontes e limitações.</p><p>Os IDs identificam os registros históricos. Os links podem abrir o contexto atual da análise, sem representar uma cópia da revisão histórica.</p></div></header>
    <div className={styles.filters}>
      <label><span>Tipo de evento</span><select value={category} onChange={(event) => setCategory(event.target.value as TimelineCategory | "ALL")}><option value="ALL">Todos os tipos</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>De</span><input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)}/></label>
      <label><span>Até</span><input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)}/></label>
      {(category !== "ALL" || fromDate || toDate) && <button className="button ghost small" type="button" onClick={() => { setCategory("ALL"); setFromDate(""); setToDate(""); }}>Limpar filtros</button>}
    </div>
    <p className={styles.scope}>{seasonId ? `Safra selecionada: ${data?.seasons.find((season) => season.id === seasonId)?.label || "conforme seleção do talhão"}.` : "Todas as safras registradas."} Eventos sem vínculo de safra permanecem identificados como histórico do talhão.</p>
    <div aria-live="polite" aria-busy={loading}>
      {loading && <p className={styles.state} role="status">Carregando histórico…</p>}
      {error && <div className={styles.state}><p role="alert">{error}</p><button type="button" className="button secondary" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button></div>}
      {filterError && <p className={styles.limitation} role="alert">{filterError}</p>}
      {invalidPeriod && <p className={styles.limitation} role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
      {!loading && !error && !invalidPeriod && !filterError && groups.length === 0 && <p className={styles.state}>Nenhum evento registrado para os filtros selecionados.</p>}
      {!loading && !error && data && data.undatedCount > 0 && <p className={styles.limitation}>{data.undatedCount} registro(s) sem data válida não foram incluídos na sequência temporal.</p>}
    </div>
    {!loading && !error && groups.map((group) => <div key={group.day} className={styles.day}><h3 className={styles.dayHeading}>{displayDate(group.day)}</h3><div className={styles.events}>{group.events.map((event) => <TimelineRecord key={event.id} event={event} seasonLabel={data?.seasons.find((season) => season.id === event.seasonId)?.label ?? null}/>)}</div></div>)}
  </section>;
}
