export const dashboardMetrics = [
  { label: "Análises ativas", value: "28", trend: "+6 esta semana", tone: "teal" },
  { label: "Aguardando revisão", value: "7", trend: "3 com prioridade", tone: "copper" },
  { label: "Pontos coletados", value: "184", trend: "92% do planejado", tone: "cyan" },
  { label: "Clientes ativos", value: "42", trend: "+4 neste mês", tone: "green" },
] as const;

export const analyses = [
  {
    id: "AN-2026-0148",
    client: "Fazenda Horizonte",
    area: "Talhão Norte · 42,8 ha",
    status: "Aguardando revisão",
    statusTone: "review",
    progress: 82,
    updated: "Há 18 min",
    alerts: 1,
  },
  {
    id: "AN-2026-0147",
    client: "Agropecuária Santa Clara",
    area: "Área 03 · 18,2 ha",
    status: "Com inconsistências",
    statusTone: "danger",
    progress: 46,
    updated: "Há 1 h",
    alerts: 3,
  },
  {
    id: "AN-2026-0146",
    client: "Sítio Boa Semente",
    area: "Lavoura Sul · 11,6 ha",
    status: "Aguardando laboratório",
    statusTone: "waiting",
    progress: 34,
    updated: "Ontem, 16:40",
    alerts: 0,
  },
  {
    id: "AN-2026-0145",
    client: "Fazenda Três Irmãos",
    area: "Talhão 05 · 31,4 ha",
    status: "Aprovada",
    statusTone: "success",
    progress: 100,
    updated: "Ontem, 14:12",
    alerts: 0,
  },
] as const;

export const tasks = [
  { time: "08:30", title: "Coleta · Fazenda Horizonte", detail: "24 pontos · Técnico Lucas", type: "field" },
  { time: "10:00", title: "Revisar AN-2026-0148", detail: "Talhão Norte · Alta confiabilidade", type: "review" },
  { time: "14:30", title: "Importação · LabSolo", detail: "3 laudos recebidos", type: "lab" },
] as const;

export const samplePoints = [
  { id: "P01", x: 16, y: 24, className: "high", value: "6,1" },
  { id: "P02", x: 39, y: 18, className: "medium", value: "5,6" },
  { id: "P03", x: 67, y: 27, className: "low", value: "5,0" },
  { id: "P04", x: 79, y: 55, className: "low", value: "4,8" },
  { id: "P05", x: 55, y: 69, className: "medium", value: "5,5" },
  { id: "P06", x: 27, y: 66, className: "high", value: "6,0" },
] as const;

export const clients = [
  { name: "Fazenda Horizonte", city: "Palmeira das Missões · RS", properties: 2, hectares: "126,4", analyses: 8, status: "Ativo" },
  { name: "Agropecuária Santa Clara", city: "Boa Vista das Missões · RS", properties: 1, hectares: "84,7", analyses: 5, status: "Ativo" },
  { name: "Fazenda Três Irmãos", city: "Sarandi · RS", properties: 3, hectares: "218,9", analyses: 12, status: "Ativo" },
  { name: "Sítio Boa Semente", city: "Chapada · RS", properties: 1, hectares: "31,2", analyses: 3, status: "Pendente" },
] as const;
