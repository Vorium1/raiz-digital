"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/ui";
import { RealFieldMap, type MapPoint } from "@/components/real-field-map";
import { FieldNdviPanel } from "@/components/field-ndvi-panel";
import { analysisDisplayStatus, formatRelativeOrDate } from "@/domain/analysis-ui";
import type { FieldOverview } from "@/lib/repositories/field-overview";
import type { OperationalAlert } from "@/lib/repositories/alerts";

type Tab = "visao" | "evidencias" | "decisoes" | "timeline";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "evidencias", label: "Evidências" },
  { id: "decisoes", label: "Decisões" },
  { id: "timeline", label: "Linha do tempo" },
];

const PRIORITY_TONE: Record<string, "danger" | "review" | "waiting"> = { ALTA: "danger", MEDIA: "review", BAIXA: "waiting" };

type MapLayerResponse = { fieldBoundary: unknown; points: MapPoint[]; availableParameters: string[] };

/**
 * Talhão 360° (RAIZ 2.0, Fase 1, Etapa 5). Reaproveita componentes já prontos inteiros --
 * `RealFieldMap`, `FieldNdviPanel` -- em vez de recriar mapa/NDVI. "Safra" funciona como filtro real
 * (não decorativo): troca o conjunto de ordens/análises mostradas nas abas Evidências e Decisões.
 */
export function FieldOverviewTabs({ overview, alerts }: { overview: FieldOverview; alerts: OperationalAlert[] }) {
  const { field, seasons, orders, analyses, yieldHistory, ndviSnapshots, gpsQuality, reports } = overview;
  const [tab, setTab] = useState<Tab>("visao");
  const [seasonId, setSeasonId] = useState<string>(seasons[0]?.id ?? "");
  const selectedSeason = seasons.find((s) => s.id === seasonId) ?? null;

  const seasonOrders = useMemo(() => orders.filter((o) => !seasonId || o.cropSeasonId === seasonId), [orders, seasonId]);
  const seasonAnalyses = useMemo(() => analyses.filter((a) => !seasonId || a.cropSeasonId === seasonId), [analyses, seasonId]);
  const seasonYield = useMemo(() => yieldHistory.filter((y) => !selectedSeason || y.seasonLabel === selectedSeason.seasonLabel), [yieldHistory, selectedSeason]);

  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  useEffect(() => { setSelectedOrderId(seasonOrders[0]?.id ?? ""); }, [seasonId]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedOrder = seasonOrders.find((o) => o.id === selectedOrderId) ?? null;
  const [layer, setLayer] = useState<MapLayerResponse | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);
  useEffect(() => {
    if (!selectedOrderId) { setLayer(null); return; }
    setLayerLoading(true);
    void fetch(`/api/collection-orders/${selectedOrderId}/map-layer`, { cache: "no-store" })
      .then((r) => r.json()).then((data) => { setLayer(data); setLayerLoading(false); });
  }, [selectedOrderId]);

  const totalPlanned = seasonOrders.reduce((sum, o) => sum + o.plannedPoints, 0);
  const totalCollected = seasonOrders.reduce((sum, o) => sum + o.collectedPoints, 0);
  const coveragePct = totalPlanned > 0 ? Math.round((totalCollected / totalPlanned) * 100) : null;
  const gpsPct = gpsQuality.total > 0 ? Math.round((gpsQuality.confirmedCount / gpsQuality.total) * 100) : null;

  // Situação real da avaliação: baseada nas análises desta safra, nunca "0 problemas" quando na verdade
  // nada foi avaliado ainda (mesmo cuidado do dashboard -- achado real da auditoria, item B).
  const evaluationStatus = useMemo(() => {
    if (seasonAnalyses.length === 0) return { label: "Sem análise nesta safra", tone: "neutral" as const };
    const notInterpretable = seasonAnalyses.filter((a) => a.latestInterpretationStatus === "CALCULATED" && a.notInterpretableReason);
    const approved = seasonAnalyses.filter((a) => a.latestInterpretationStatus === "APPROVED");
    const inReview = seasonAnalyses.filter((a) => a.latestInterpretationStatus === "IN_REVIEW");
    if (approved.length === seasonAnalyses.length) return { label: "Avaliado e aprovado", tone: "success" as const };
    if (inReview.length > 0) return { label: "Aguardando revisão profissional", tone: "review" as const };
    if (notInterpretable.length > 0) return { label: `${notInterpretable.length} de ${seasonAnalyses.length} sem parâmetro interpretável`, tone: "waiting" as const };
    return { label: "Avaliação em andamento", tone: "waiting" as const };
  }, [seasonAnalyses]);

  // Linha do tempo: junta datas REAIS de cada tabela (nunca inventa uma data). Quando só existe
  // created_at (sem uma data de domínio própria, ex. planned_at), rotula "Cadastrado em" -- pedido
  // explícito do briefing pra nunca disfarçar data de cadastro como data do evento real.
  const timelineEvents = useMemo(() => {
    const events: Array<{ date: string; label: string; detail: string; icon: "location" | "flask" | "shield" | "sparkles" | "file" }> = [];
    for (const o of seasonOrders) {
      events.push({ date: o.plannedAt ?? o.createdAt, label: o.plannedAt ? `Coleta planejada — ${o.code}` : `Cadastrado em — ordem ${o.code}`, detail: `${o.collectedPoints}/${o.plannedPoints} pontos`, icon: "location" });
    }
    for (const a of seasonAnalyses) {
      events.push({ date: a.createdAt, label: `Cadastrado em — análise ${a.code}`, detail: "Entrada laboratorial", icon: "flask" });
      if (a.interpretedAt) events.push({ date: a.interpretedAt, label: `Interpretação calculada — ${a.code}`, detail: a.notInterpretableReason ?? "Motor determinístico executado", icon: "sparkles" });
      if (a.reviewedAt) events.push({ date: a.reviewedAt, label: `Revisão registrada — ${a.code}`, detail: "Profissional revisou a interpretação", icon: "shield" });
      if (a.approvedAt) events.push({ date: a.approvedAt, label: `Interpretação aprovada — ${a.code}`, detail: "Validação profissional concluída", icon: "shield" });
    }
    for (const n of ndviSnapshots) events.push({ date: n.capturedAt, label: "Leitura de satélite (NDVI)", detail: `NDVI médio ${n.meanNdvi.toFixed(2)} · ${n.source}`, icon: "sparkles" });
    for (const r of reports) events.push({ date: r.publishedAt, label: `Relatório publicado — ${r.analysisCode}`, detail: `Revisão #${r.revision}`, icon: "file" });
    return events.filter((e) => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [seasonOrders, seasonAnalyses, ndviSnapshots, reports]);

  return (
    <div className="field-overview">
      <div className="field-overview-header card">
        <div className="field-overview-breadcrumb"><Link href="/coletas">{field.clientName}</Link><Icon name="chevron" size={12}/><span>{field.propertyName}</span><Icon name="chevron" size={12}/><strong>{field.name}</strong></div>
        <div className="field-overview-stats">
          <div><span>Área</span><strong>{field.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
          <div><span>Cultura atual</span><strong>{selectedSeason?.currentCrop || "Não informada"}</strong></div>
          <div><span>Próxima cultura</span><strong>{selectedSeason?.nextCrop || "Não planejada"}</strong></div>
          <div><span>Situação da avaliação</span><StatusBadge tone={evaluationStatus.tone === "neutral" ? "waiting" : evaluationStatus.tone}>{evaluationStatus.label}</StatusBadge></div>
          <div><span>Origem geográfica</span><strong>{gpsPct != null ? `${gpsPct}% GPS confirmado em campo` : "Sem pontos coletados"}</strong></div>
        </div>
        {seasons.length > 0 && (
          <label className="field-overview-season-filter"><span>Safra</span>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.seasonLabel}{s.nextCrop ? ` · ${s.nextCrop}` : s.currentCrop ? ` · ${s.currentCrop}` : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="field-overview-tabs">
        {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === "visao" && (
        <div className="field-overview-panel">
          {alerts.length > 0 && (
            <div className="priority-list card">
              {alerts.map((a) => (
                <Link key={a.id} href={a.href} className="priority-row">
                  <StatusBadge tone={PRIORITY_TONE[a.criticality]}>{a.criticality}</StatusBadge>
                  <div><strong>{a.title}</strong><small>{a.description}</small></div>
                  <Icon name="chevron" size={16}/>
                </Link>
              ))}
            </div>
          )}
          <RealFieldMap boundary={field.boundary as any} points={[]} height={380} hint="Contorno real do talhão — veja pontos na aba Evidências"/>
          <div className="field-overview-stats card" style={{ padding: 16 }}>
            <div><span>Cobertura de coleta</span><strong>{coveragePct != null ? `${coveragePct}%` : "—"}</strong></div>
            <div><span>Análises nesta safra</span><strong>{seasonAnalyses.length}</strong></div>
            <div><span>Leituras de satélite</span><strong>{ndviSnapshots.length}</strong></div>
            <div><span>Relatórios publicados</span><strong>{reports.length}</strong></div>
          </div>
        </div>
      )}

      {tab === "evidencias" && (
        <div className="field-overview-panel">
          <div className="field-overview-order-picker">
            {seasonOrders.length === 0 && <p className="report-empty-note">Nenhuma ordem de coleta nesta safra.</p>}
            {seasonOrders.map((o) => (
              <button key={o.id} type="button" className={selectedOrderId === o.id ? "active" : ""} onClick={() => setSelectedOrderId(o.id)}>
                {o.code} · {o.depthFromCm}–{o.depthToCm}cm · {o.collectedPoints}/{o.plannedPoints}
              </button>
            ))}
          </div>
          {selectedOrder && (layerLoading ? <div className="agro-loading"><Icon name="clock" size={15}/>Carregando pontos…</div> : (
            <RealFieldMap boundary={(layer?.fieldBoundary ?? field.boundary) as any} points={layer?.points ?? []} height={380} hint="Clique num ponto pra ver o resultado"/>
          ))}
          <FieldNdviPanel fieldId={field.id}/>
        </div>
      )}

      {tab === "decisoes" && (
        <div className="field-overview-panel">
          <div className="field-ops-list card">
            {seasonAnalyses.length === 0 && <p className="report-empty-note" style={{ padding: 16 }}>Nenhuma análise nesta safra.</p>}
            {seasonAnalyses.map((a) => {
              const meta = analysisDisplayStatus(a);
              return (
                <Link key={a.id} href={`/analises/${a.id}`} className="field-ops-list-row">
                  <span><strong>{a.code}</strong><small>Atualizado {formatRelativeOrDate(a.updatedAt)}{a.confidenceScore != null ? ` · confiabilidade do laudo ${Math.round(a.confidenceScore)}/100` : ""}</small></span>
                  <span className="field-ops-list-actions"><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge><Icon name="chevron" size={16}/></span>
                </Link>
              );
            })}
          </div>
          {reports.length > 0 && (
            <div className="field-ops-list card">
              <div className="field-ops-section-head compact"><div><span className="eyebrow">ENTREGAS</span><h2>Relatórios publicados</h2></div></div>
              {reports.map((r) => (
                <Link key={r.id} href={`/relatorios/talhao/${r.analysisId}`} className="field-ops-list-row">
                  <span><strong>{r.analysisCode}</strong><small>Publicado {formatRelativeOrDate(r.publishedAt)} · revisão #{r.revision}</small></span>
                  <Icon name="chevron" size={16}/>
                </Link>
              ))}
            </div>
          )}
          <Link href={`/relatorios/evolucao/${field.id}`} className="button ghost">Ver evolução histórica completa</Link>
        </div>
      )}

      {tab === "timeline" && (
        <div className="field-overview-panel">
          <div className="field-overview-timeline card">
            {timelineEvents.length === 0 && <p className="report-empty-note" style={{ padding: 16 }}>Nenhum evento registrado nesta safra ainda.</p>}
            {timelineEvents.map((e, i) => (
              <div key={i} className="field-overview-timeline-row">
                <Icon name={e.icon} size={15}/>
                <div><strong>{e.label}</strong><small>{e.detail}</small></div>
                <span>{formatRelativeOrDate(e.date)}</span>
              </div>
            ))}
          </div>
          {seasonYield.length > 0 && (
            <div className="field-overview-timeline card">
              <div className="field-ops-section-head compact"><div><span className="eyebrow">PRODUTIVIDADE REGISTRADA</span><h2>Histórico de colheita</h2></div><Link href="/coletas#produtividade">Editar</Link></div>
              {seasonYield.map((y) => (
                <div key={y.id} className="field-overview-timeline-row">
                  <Icon name="leaf" size={15}/>
                  <div><strong>{y.crop}{y.cultivar ? ` · ${y.cultivar}` : ""}</strong><small>{y.yieldValue} {y.yieldUnit} · fonte: {y.source}</small></div>
                  <span>{formatRelativeOrDate(y.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
