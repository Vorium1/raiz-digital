"use client";

import { Icon } from "@/components/icon";

/**
 * Fase 4, Bloco 5 — ponto de entrada contextual discreto pro Assistente RAIZ, usado nas telas de maior
 * valor (Talhão 360°, Análise, Inteligência, Mapas, Comparativos). Deliberadamente NÃO é um componente de
 * assistente próprio: só dispara o mesmo evento global que `AssistantRaizWidget` escuta pra se abrir --
 * um único Assistente, sempre com o contexto real da tela onde o botão está (o widget já deriva contexto
 * do `pathname`/`searchParams` sozinho, não recebe nada deste botão).
 */
export function AssistantEntryButton({ label }: { label: string }) {
  return (
    <button type="button" className="assistant-entry-button" onClick={() => window.dispatchEvent(new Event("raiz-assistant:open"))}>
      <Icon name="sparkles" size={13} />
      {label}
    </button>
  );
}
