"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
const VALID_TAB_IDS = new Set<string>(TABS.map((t) => t.id));

const PRIORITY_TONE: Record<string, "danger" | "review" | "waiting"> = { ALTA: "danger", MEDIA: "review", BAIXA: "waiting" };

type MapLayerResponse = { fieldBoundary: unknown; points: MapPoint[]; availableParameters: string[] };

/**
 * Talhão 360° (RAIZ 2.0, Fase 1, Etapa 5). Reaproveita componentes já prontos inteiros --
 * `RealFieldMap`, `FieldNdviPanel` -- em vez de recriar mapa/NDVI. "Safra" funciona como filtro real
 * (não decorativo): troca o conjunto de ordens/análises mostradas nas abas Evidências e Decisões.
 */
export function FieldOverviewTabs({ overview, alerts }: { overview: FieldOverview; alerts: OperationalAlert[] }) {
  const { field, seasons, orders, analyses, yieldHistory, ndviSnapshots, gpsQuality, reports } = overview;
  const router = useRouter();
  const searchParams = useSearchParams();

  // Item 1 (revisão independente do fechamento da Fase 1): aba/safra/ordem eram só useState local, perdidos
  // ao recarregar ou abrir um link direto. Corrigido usando a URL como fonte da verdade, mesmo padrão já
  // usado em DashboardFilters -- nunca confia cegamente no valor da URL: cada um só é aceito se
  // corresponder a um dado real (aba válida, safra que existe de fato, ordem que pertence à safra
  // resolvida) -- senão cai no padrão (visão geral / primeira safra / primeira ordem da safra).
  const urlTab = searchParams.get("aba");
  const [tab, setTabState] = useState<Tab>(urlTab && VALID_TAB_IDS.has(urlTab) ? (urlTab as Tab) : "visao");

  const urlSeasonId = searchParams.get("safra");
  const [seasonId, setSeasonIdState] = useState<string>(
    urlSeasonId && seasons.some((s) => s.id === urlSeasonId) ? urlSeasonId : (seasons[0]?.id ?? ""),
  );
  const selectedSeason = seasons.find((s) => s.id === seasonId) ?? null;

  const seasonOrders = useMemo(() => orders.filter((o) => !seasonId || o.cropSeasonId === seasonId), [orders, seasonId]);
  const seasonAnalyses = useMemo(() => analyses.filter((a) => !seasonId || a.cropSeasonId === seasonId), [analyses, seasonId]);
  const seasonReports = useMemo(() => reports.filter((r) => !seasonId || r.cropSeasonId === seasonId), [reports, seasonId]);
  const seasonYield = useMemo(() => yieldHistory.filter((y) => !selectedSeason || y.seasonLabel === selectedSeason.seasonLabel), [yieldHistory, selectedSeason]);

  const urlOrderId = searchParams.get("ordem");
  const [selectedOrderId, setSelectedOrderIdState] = useState<string>(
    urlOrderId && seasonOrders.some((o) => o.id === urlOrderId) ? urlOrderId : (seasonOrders[0]?.id ?? ""),
  );
  const selectedOrder = seasonOrders.find((o) => o.id === selectedOrderId) ?? null;

  function updateUrl(next: { tab?: Tab; seasonId?: string; orderId?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.tab !== undefined) params.set("aba", next.tab);
    if (next.seasonId !== undefined) { if (next.seasonId) params.set("safra", next.seasonId); else params.delete("safra"); }
    if (next.orderId !== undefined) { if (next.orderId) params.set("ordem", next.orderId); else params.delete("ordem"); }
    router.replace(`/talhoes/${field.id}?${params.toString()}`, { scroll: false });
  }
  function selectTab(next: Tab) { setTabState(next); updateUrl({ tab: next }); }
  function selectSeason(next: string) {
    // Trocar de safra invalida a ordem selecionada (podia pertencer à safra anterior) -- escolhe a
    // primeira ordem real da nova safra, nunca deixa uma ordem de outra safra "grudada" na seleção.
    setSeasonIdState(next);
    const firstOrderOfSeason = orders.find((o) => o.cropSeasonId === next)?.id ?? "";
    setSelectedOrderIdState(firstOrderOfSeason);
    updateUrl({ seasonId: next, orderId: firstOrderOfSeason });
  }
  function selectOrder(next: string) { setSelectedOrderIdState(next); updateUrl({ orderId: next }); }

  const [layer, setLayer] = useState<MapLayerResponse | null>(null);
  const [layerLoading, setLayerLoading] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedOrderId) { setLayer(null); setLayerError(null); setLayerLoading(false); return; }
    // Item 2 (revisão independente): a busca antiga não tratava status HTTP de erro (um 404/500 virava
    // `.json()` de qualquer jeito, possivelmente mostrando lixo como se fossem pontos reais), não tratava
    // falha de rede (promise rejeitada sem captura -- carregando ficava travado pra sempre, sem erro
    // visível), e não cancelava respostas antigas ao trocar de ordem rápido -- se a resposta da ordem
    // anterior chegasse DEPOIS da nova, ela podia "vencer" e mostrar pontos da ordem errada como se fossem
    // da atual. AbortController resolve os três: cancela a busca anterior de verdade (nunca aplica o
    // resultado dela), e o catch trata erro de rede/HTTP com uma mensagem real, nunca uma tela quebrada.
    const controller = new AbortController();
    setLayerLoading(true);
    setLayerError(null);
    fetch(`/api/collection-orders/${selectedOrderId}/map-layer`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar os pontos desta ordem (HTTP ${response.status}).`);
        return response.json() as Promise<MapLayerResponse>;
      })
      .then((data) => { setLayer(data); setLayerLoading(false); })
      .catch((error) => {
        if (controller.signal.aborted) return; // ordem trocou antes da resposta chegar -- ignorada de propósito
        setLayer(null);
        setLayerLoading(false);
        setLayerError(error instanceof Error ? error.message : "Falha ao carregar os pontos desta ordem.");
      });
    return () => controller.abort();
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
  //
  // Item 3 (revisão independente): NDVI não tem vínculo real com safra (field_ndvi_snapshots não tem
  // crop_season_id -- não dá pra saber com segurança a qual safra uma leitura pertenceria, e adivinhar por
  // data seria inventar uma associação que o dado não garante). Por isso essas linhas SEMPRE aparecem
  // (histórico do talhão inteiro, não filtrado por safra) e ficam marcadas "(histórico do talhão)" pra
  // nunca parecerem um evento desta safra específica. Ordens/análises/relatórios têm vínculo real de safra
  // e por isso usam as listas já filtradas (seasonOrders/seasonAnalyses/seasonReports).
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
    for (const n of ndviSnapshots) events.push({ date: n.capturedAt, label: "Leitura de satélite (histórico do talhão)", detail: `NDVI médio ${n.meanNdvi.toFixed(2)} · ${n.source}`, icon: "sparkles" });
    for (const r of seasonReports) events.push({ date: r.publishedAt, label: `Relatório publicado — ${r.analysisCode}`, detail: `Revisão #${r.revision}`, icon: "file" });
    return events.filter((e) => e.date).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [seasonOrders, seasonAnalyses, ndviSnapshots, seasonReports]);

  return (
    <div className="field-overview">
      <div className="field-overview-header card">
        <div className="field-overview-breadcrumb"><Link href="/coletas">{field.clientName}</Link><Icon name="chevron" size={12}/><span>{field.propertyName}</span><Icon name="chevron" size={12}/><strong>{field.name}</strong></div>
        <div className="field-overview-stats">
          <div><span>Área</span><strong>{field.areaHa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ha</strong></div>
          <div><span>Cultura atual</span><strong>{selectedSeason?.currentCrop || "Não informada"}</strong></div>
          <div><span>Próxima cultura</span><strong>{selectedSeason?.nextCrop || "Não planejada"}</strong></div>
          <div><span>Situação da avaliação</span><StatusBadge tone={evaluationStatus.tone === "neutral" ? "waiting" : evaluationStatus.tone}>{evaluationStatus.label}</StatusBadge></div>
          <div><span>Origem geográfica (histórico do talhão)</span><strong>{gpsPct != null ? `${gpsPct}% GPS confirmado em campo` : "Sem pontos coletados"}</strong></div>
        </div>
        {seasons.length > 0 && (
          <label className="field-overview-season-filter"><span>Safra</span>
            <select value={seasonId} onChange={(e) => selectSeason(e.target.value)}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.seasonLabel}{s.nextCrop ? ` · ${s.nextCrop}` : s.currentCrop ? ` · ${s.currentCrop}` : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="field-overview-tabs">
        {TABS.map((t) => <button key={t.id} type="button" className={tab === t.id ? "active" : ""} onClick={() => selectTab(t.id)}>{t.label}</button>)}
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
            <div><span>Leituras de satélite (histórico do talhão)</span><strong>{ndviSnapshots.length}</strong></div>
            <div><span>Relatórios publicados nesta safra</span><strong>{seasonReports.length}</strong></div>
          </div>
        </div>
      )}

      {tab === "evidencias" && (
        <div className="field-overview-panel">
          <div className="field-overview-order-picker">
            {seasonOrders.length === 0 && <p className="report-empty-note">Nenhuma ordem de coleta nesta safra.</p>}
            {seasonOrders.map((o) => (
              <button key={o.id} type="button" className={selectedOrderId === o.id ? "active" : ""} onClick={() => selectOrder(o.id)}>
                {o.code} · {o.depthFromCm}–{o.depthToCm}cm · {o.collectedPoints}/{o.plannedPoints}
              </button>
            ))}
          </div>
          {selectedOrder && (
            layerLoading ? <div className="agro-loading"><Icon name="clock" size={15}/>Carregando pontos…</div>
            : layerError ? <div className="field-ops-message danger"><Icon name="warning" size={17}/><span>{layerError}</span></div>
            : <RealFieldMap boundary={(layer?.fieldBoundary ?? field.boundary) as any} points={layer?.points ?? []} height={380} hint="Clique num ponto pra ver o resultado"/>
          )}
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
          {seasonReports.length > 0 && (
            <div className="field-ops-list card">
              <div className="field-ops-section-head compact"><div><span className="eyebrow">ENTREGAS · ESTA SAFRA</span><h2>Relatórios publicados</h2></div></div>
              {seasonReports.map((r) => (
                <Link key={r.id} href={`/relatorios/talhao/${r.analysisId}`} className="field-ops-list-row">
                  <span><strong>{r.analysisCode}</strong><small>Publicado {formatRelativeOrDate(r.publishedAt)} · revisão #{r.revision}</small></span>
                  <Icon name="chevron" size={16}/>
                </Link>
              ))}
            </div>
          )}
          <Link href={`/relatorios/evolucao/${field.id}`} className="button ghost">Ver evolução histórica completa (todas as safras)</Link>
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
