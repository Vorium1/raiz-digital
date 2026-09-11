"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { inferScreenContext, inferScreenState, type AssistantScreenContext } from "@/lib/ai/assistant-screen";
import type { AssistantFact, AssistantAttentionPoint, AssistantPattern, AssistantHypothesis, AssistantTechnicalReference, AssistantCard } from "@/lib/ai/assistant-response-schema";
import type { ResolvedAssistantAction } from "@/lib/ai/assistant-actions-schema";

/**
 * Fase 4, Bloco 5 — painel contextual do Assistente RAIZ. Deixou de ser uma bolha de chat genérica:
 * - cabeçalho SEMPRE derivado do Evidence Package já validado no servidor (`/api/assistant/context`,
 *   `assistant-context-label.ts`) — nunca do que o client afirma que a tela é; "Contexto indisponível"
 *   quando o rótulo não pôde ser resolvido (contexto inválido ou entidade fora do tenant);
 * - sugestões de pergunta por tela (`CONTEXTUAL_SUGGESTIONS`, abaixo), restritas ao que o provider local
 *   realmente reconhece hoje — nunca uma pergunta que soa bem mas não bate com nenhuma intenção real;
 * - resposta visualmente estruturada — Resumo/Fatos/Pontos de atenção/Padrão/Hipóteses/Informações
 *   faltantes/Fontes técnicas/Ações nunca misturados num bloco de texto só;
 * - cada mensagem do histórico guarda o rótulo de contexto em que foi respondida (`entry.contextLabel`) --
 *   trocar de talhão nunca faz uma resposta antiga parecer que pertence ao novo contexto.
 */

type ChatEntry = {
  question: string;
  contextLabel: string | null;
  summary: string;
  facts: AssistantFact[];
  attentionPoints: AssistantAttentionPoint[];
  patterns: AssistantPattern[];
  hypotheses: AssistantHypothesis[];
  missingInformation: string[];
  technicalReferences: AssistantTechnicalReference[];
  actions: ResolvedAssistantAction[];
  cards: AssistantCard[];
  isRealLanguageModel: boolean;
};

const DEFAULT_SUGGESTIONS = [
  "Quais talhões têm pontos pendentes?",
  "Quantos laudos entraram este mês?",
  "Quais clientes possuem análises aguardando revisão?",
  "Mostre os talhões com menor confiabilidade.",
  "Quais são as principais pendências da minha operação?",
];

/** Cada pergunta aqui precisa bater com uma intenção real de `local-intent-assistant-provider.ts` (12
 *  intenções no total) -- checado uma a uma contra os `regex`/`screenContext` de cada branch antes de
 *  entrar nesta lista, nunca uma pergunta aspiracional. */
const CONTEXTUAL_SUGGESTIONS: Partial<Record<AssistantScreenContext["type"], string[]>> = {
  dashboard: [
    "Quais coletas estão atrasadas?",
    "Quais talhões têm pontos pendentes?",
    "Quantos laudos entraram este mês?",
    "Quais análises aguardam revisão técnica?",
    "Mostre os talhões com menor confiabilidade.",
  ],
  field: ["Compare esta safra com a anterior.", "Quais são as principais pendências da minha operação?"],
  property: ["Faça um resumo desta propriedade."],
  "report-property": ["Faça um resumo desta propriedade."],
  analysis: ["Qual a confiabilidade desta interpretação?", "Qual regra técnica foi usada nesta análise?", "Quais são os pontos de atenção desta análise?"],
  "report-field": ["Quais são as principais pendências da minha operação?"],
  intelligence: ["Quantos itens estão na fila com os filtros atuais?", "Quais análises aguardam revisão técnica?"],
  map: ["O que estou vendo neste mapa?", "Mostre só os pontos pendentes."],
  comparison: ["Resuma este comparativo.", "Qual a diferença entre os dois lados?"],
};

const ACTION_ICON: Record<ResolvedAssistantAction["kind"], IconName> = {
  show_on_map: "map",
  open_comparison: "layers",
  open_analysis: "flask",
  open_field: "leaf",
  open_report: "file",
  filter_intelligence: "list",
};

export function AssistantRaizWidget() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [contextValid, setContextValid] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const hidden = pathname === "/login" || pathname.startsWith("/esqueci-senha") || pathname.startsWith("/redefinir-senha");
  const screenContext = inferScreenContext(pathname);
  const screenState = inferScreenState(pathname, searchParams);
  const contextKey = JSON.stringify({ c: screenContext ?? null, s: screenState ?? null });

  // Ponto de entrada contextual (Talhão 360°, Análise, Inteligência, Mapas, Comparativos) -- um único
  // Assistente RAIZ, sempre aberto com o contexto real da tela onde o botão foi clicado (o widget deriva
  // contexto sozinho, do `pathname`/`searchParams` atual -- não recebe nada do botão que disparou o evento).
  useEffect(() => {
    function onOpenEvent() { setOpen(true); }
    window.addEventListener("raiz-assistant:open", onOpenEvent);
    return () => window.removeEventListener("raiz-assistant:open", onOpenEvent);
  }, []);

  // Cabeçalho contextual: resolve o rótulo assim que o painel abre, e de novo sempre que o contexto muda
  // enquanto está aberto (trocar de talhão precisa mudar o cabeçalho visivelmente -- nunca deixar o rótulo
  // antigo parecer que ainda é válido).
  useEffect(() => {
    if (!open || hidden) return;
    let cancelled = false;
    setContextLabel(null);
    setContextValid(false);
    fetch("/api/assistant/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ screenContext, screenState }) })
      .then((response) => response.json())
      .then((data) => { if (!cancelled) { setContextLabel(data.label ?? null); setContextValid(Boolean(data.valid)); } })
      .catch(() => { if (!cancelled) { setContextLabel(null); setContextValid(false); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hidden, contextKey]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history, busy]);

  if (hidden) return null;

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setQuestion("");
    const askedContextLabel = contextValid ? contextLabel : null;
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: trimmed, screenContext, screenState }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível responder.");
      setHistory((current) => [...current, {
        question: trimmed,
        contextLabel: askedContextLabel,
        summary: data.summary,
        facts: data.facts ?? [],
        attentionPoints: data.attention_points ?? [],
        patterns: data.patterns ?? [],
        hypotheses: data.hypotheses ?? [],
        missingInformation: data.missing_information ?? [],
        technicalReferences: data.technical_references ?? [],
        actions: data.suggested_actions ?? [],
        cards: data.cards ?? [],
        isRealLanguageModel: data.isRealLanguageModel,
      }]);
    } catch (error) {
      setHistory((current) => [...current, {
        question: trimmed,
        contextLabel: askedContextLabel,
        summary: error instanceof Error ? error.message : "Falha ao consultar o assistente.",
        facts: [], attentionPoints: [], patterns: [], hypotheses: [], missingInformation: [], technicalReferences: [], actions: [], cards: [],
        isRealLanguageModel: false,
      }]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = (screenContext && CONTEXTUAL_SUGGESTIONS[screenContext.type]) || DEFAULT_SUGGESTIONS;

  return (
    <>
      <button type="button" className={`assistant-fab ${open ? "open" : ""}`} onClick={() => setOpen((current) => !current)} aria-label={open ? "Fechar Assistente RAIZ" : "Abrir Assistente RAIZ"}>
        <Icon name={open ? "close" : "sparkles"} size={22}/>
      </button>

      {open && (
        <div className="assistant-panel">
          <div className="assistant-panel-head">
            <div className="assistant-panel-head-text">
              <strong>Assistente RAIZ</strong>
              <small>Só responde com dado real que você pode acessar</small>
              {contextValid && contextLabel ? (
                <div className="assistant-context-badge"><Icon name="location" size={11}/><span>{contextLabel}</span></div>
              ) : (
                <div className="assistant-context-badge unavailable"><Icon name="warning" size={11}/><span>Contexto indisponível</span></div>
              )}
            </div>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}><Icon name="close" size={14}/></button>
          </div>

          <div className="assistant-panel-body" ref={bodyRef}>
            {history.length === 0 ? (
              <div className="assistant-empty">
                <Icon name="sparkles" size={22}/>
                <p>{contextValid && contextLabel ? `Pergunte sobre ${contextLabel}.` : "Pergunte sobre clientes, talhões, coletas, laudos ou revisões."}</p>
                <div className="assistant-suggestions">
                  {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
                </div>
              </div>
            ) : (
              history.map((entry, index) => (
                <div className="assistant-entry" key={index}>
                  {entry.contextLabel && <div className="assistant-entry-context"><Icon name="location" size={10}/>{entry.contextLabel}</div>}
                  <div className="assistant-question">{entry.question}</div>
                  <div className="assistant-answer">
                    <span className="assistant-answer-badge"><Icon name="sparkles" size={11}/>{entry.isRealLanguageModel ? "IA" : "Motor local · sem custo"}</span>
                    <p>{entry.summary}</p>

                    {entry.facts.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Fatos</span>
                        <ul className="assistant-facts">{entry.facts.map((fact, i) => <li key={i}><strong>{fact.value}</strong> {fact.label}</li>)}</ul>
                      </div>
                    )}

                    {entry.attentionPoints.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Pontos de atenção</span>
                        <ul className="assistant-attention">{entry.attentionPoints.map((point, i) => <li key={i}><Icon name="warning" size={11}/> <strong>{point.label}</strong> — {point.reason}</li>)}</ul>
                      </div>
                    )}

                    {entry.patterns.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Padrão identificado</span>
                        <ul className="assistant-patterns">{entry.patterns.map((pattern, i) => <li key={i}>{pattern.description}<br/><code>{pattern.ruleRef}</code></li>)}</ul>
                      </div>
                    )}

                    {entry.hypotheses.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Hipóteses</span>
                        <div className="assistant-hypotheses">
                          {entry.hypotheses.map((hypothesis, i) => (
                            <div className="assistant-hypothesis" key={i}>
                              <span className="assistant-hypothesis-tag">Hipótese — não é fato confirmado</span>
                              <p>{hypothesis.statement}</p>
                              {hypothesis.missingToConfirm.length > 0 && <ul>{hypothesis.missingToConfirm.map((item, j) => <li key={j}>{item}</li>)}</ul>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.missingInformation.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Informações faltantes</span>
                        <ul className="assistant-missing-info">{entry.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul>
                      </div>
                    )}

                    {entry.technicalReferences.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Fontes técnicas</span>
                        <ul className="assistant-technical-refs">{entry.technicalReferences.map((ref, i) => <li key={i}><strong>{ref.title}</strong>{ref.institution ? ` — ${ref.institution}` : ""}</li>)}</ul>
                      </div>
                    )}

                    {entry.actions.length > 0 && (
                      <div className="assistant-section">
                        <span className="assistant-section-label">Ações</span>
                        <div className="assistant-actions">
                          {entry.actions.map((action, i) => (
                            <Link key={i} href={action.href} className="assistant-action">
                              <strong><Icon name={ACTION_ICON[action.kind] ?? "arrow"} size={12}/>{action.label}</strong>
                              <small>{action.description}</small>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.cards.length > 0 && (
                      <div className="assistant-section">
                        <div className="assistant-cards">
                          {entry.cards.map((card, i) => card.href ? (
                            <Link key={i} href={card.href} className="assistant-card"><strong>{card.title}</strong><small>{card.description}</small></Link>
                          ) : (
                            <div key={i} className="assistant-card static"><strong>{card.title}</strong><small>{card.description}</small></div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {busy && <div className="assistant-entry"><div className="assistant-answer"><p><Icon name="clock" size={12}/> Consultando dados reais…</p></div></div>}
          </div>

          <form className="assistant-panel-form" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Pergunte sobre sua operação…" disabled={busy}/>
            <button type="submit" className="icon-button" disabled={busy || !question.trim()} aria-label="Enviar"><Icon name="arrow" size={15}/></button>
          </form>
        </div>
      )}
    </>
  );
}
