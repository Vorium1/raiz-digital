type AlertLike = {
  category: string;
  fieldId: string | null;
};

const NON_ACTIONABLE_ON_HOME = new Set([
  "Parâmetro sem regra homologada",
  "Aviso climático da safra",
  "Interpretação aguardando revisão",
]);

export function userActionAlerts<T extends AlertLike>(alerts: T[]): T[] {
  return alerts.filter((alert) => Boolean(alert.fieldId) && !NON_ACTIONABLE_ON_HOME.has(alert.category));
}

export function userAttentionTitle(category: string): string {
  const labels: Record<string, string> = {
    "Coleta atrasada": "A coleta está atrasada",
    "Pontos não coletados": "Termine a coleta",
    "Laudo aguardando importação": "Envie o laudo",
    "Dados inválidos": "Confira os dados recebidos",
    "Talhão sem cultura definida": "Informe a cultura",
    "Talhão sem safra definida": "Informe a safra",
    "Análise incompleta": "Continue este trabalho",
    "Reanálise de solo vencida": "Está na hora de analisar novamente",
    "Desvio de aplicação de insumo": "Confira a aplicação",
  };
  return labels[category] ?? "Confira este item";
}

export function userAttentionHref(alert: { category: string; fieldId: string | null; href: string }): string {
  if (alert.fieldId && [
    "Coleta atrasada",
    "Pontos não coletados",
    "Talhão sem cultura definida",
    "Talhão sem safra definida",
    "Reanálise de solo vencida",
  ].includes(alert.category)) return `/talhoes/${alert.fieldId}`;
  return alert.href;
}
