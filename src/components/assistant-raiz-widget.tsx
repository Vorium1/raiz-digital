"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";

type AssistantCard = { title: string; description: string; href?: string };
type AssistantScreenContext = { type: "field" | "analysis" | "property" | "dashboard"; id?: string };
type ChatEntry = { question: string; answer: string; cards: AssistantCard[]; isRealLanguageModel: boolean };

const DEFAULT_SUGGESTIONS = [
  "Quais talhões têm pontos pendentes?",
  "Quantos laudos entraram este mês?",
  "Quais clientes possuem análises aguardando revisão?",
  "Mostre os talhões com menor confiabilidade.",
  "Quais são as principais pendências da minha operação?",
];

function inferScreenContext(pathname: string): AssistantScreenContext | undefined {
  const analysisMatch = pathname.match(/^\/analises\/([0-9a-f-]{36})$/);
  if (analysisMatch) return { type: "analysis", id: analysisMatch[1] };
  if (pathname === "/dashboard") return { type: "dashboard" };
  return undefined;
}

const CONTEXT_HINT: Record<string, string> = {
  analysis: "Pergunte sobre esta análise — ex.: “Explique este resultado.”",
  dashboard: "Pergunte sobre a operação inteira — ex.: “Qual é minha maior pendência hoje?”",
};

export function AssistantRaizWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);

  if (pathname === "/login" || pathname.startsWith("/esqueci-senha") || pathname.startsWith("/redefinir-senha")) return null;

  const screenContext = inferScreenContext(pathname);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: trimmed, screenContext }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível responder.");
      setHistory((current) => [...current, { question: trimmed, answer: data.answer, cards: data.cards ?? [], isRealLanguageModel: data.isRealLanguageModel }]);
    } catch (error) {
      setHistory((current) => [...current, { question: trimmed, answer: error instanceof Error ? error.message : "Falha ao consultar o assistente.", cards: [], isRealLanguageModel: false }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`assistant-fab ${open ? "open" : ""}`} onClick={() => setOpen((current) => !current)} aria-label={open ? "Fechar Assistente RAIZ" : "Abrir Assistente RAIZ"}>
        <Icon name={open ? "close" : "sparkles"} size={22}/>
      </button>

      {open && (
        <div className="assistant-panel">
          <div className="assistant-panel-head">
            <div><strong>Assistente RAIZ</strong><small>Só responde com dado real que você pode acessar</small></div>
            <button type="button" className="icon-button" aria-label="Fechar" onClick={() => setOpen(false)}><Icon name="close" size={14}/></button>
          </div>

          <div className="assistant-panel-body">
            {history.length === 0 ? (
              <div className="assistant-empty">
                <Icon name="sparkles" size={22}/>
                <p>{screenContext ? CONTEXT_HINT[screenContext.type] ?? "Pergunte sobre sua operação." : "Pergunte sobre clientes, talhões, coletas, laudos ou revisões."}</p>
                <div className="assistant-suggestions">
                  {DEFAULT_SUGGESTIONS.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
                </div>
              </div>
            ) : (
              history.map((entry, index) => (
                <div className="assistant-entry" key={index}>
                  <div className="assistant-question">{entry.question}</div>
                  <div className="assistant-answer">
                    <span className="assistant-answer-badge"><Icon name="sparkles" size={11}/>{entry.isRealLanguageModel ? "IA" : "Motor local · sem custo"}</span>
                    <p>{entry.answer}</p>
                    {entry.cards.length > 0 && (
                      <div className="assistant-cards">
                        {entry.cards.map((card, cardIndex) => card.href ? (
                          <Link key={cardIndex} href={card.href} className="assistant-card">
                            <strong>{card.title}</strong><small>{card.description}</small>
                          </Link>
                        ) : (
                          <div key={cardIndex} className="assistant-card static">
                            <strong>{card.title}</strong><small>{card.description}</small>
                          </div>
                        ))}
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
