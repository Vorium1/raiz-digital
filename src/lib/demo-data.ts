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
    status: "Aprovada",
    statusTone: "success",
    progress: 100,
    updated: "Há 18 min",
    alerts: 0,
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
  {
    id: "AN-2026-0141",
    client: "Fazenda Horizonte",
    area: "Talhão Sul · 28,1 ha",
    status: "Substituída",
    statusTone: "waiting",
    progress: 100,
    updated: "11/06, 11:20",
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

/**
 * Resultado interpretado de exemplo para AN-2026-0148 (Fazenda Horizonte · Talhão Norte), no mesmo
 * formato que AgronomicIntelligencePanel espera de /api/analyses/[id]/interpretation. Usado só em
 * DATA_MODE=demo — nunca aparece se houver banco real conectado.
 */
export const demoInterpretation = {
  status: "APPROVED" as const,
  revision: 2,
  createdAt: "2026-08-29T14:12:00-03:00",
  confidence: { score: 88, level: "ALTA" },
  cropProfileCode: "SOJA",
  cropProfileVersion: "2.1",
  rows: [
    { sampleCode: "P01", parameterCode: "pH_H2O", value: "6,1", unit: "", classification: "Adequado" },
    { sampleCode: "P01", parameterCode: "P_Mehlich", value: "9,8", unit: "mg/dm³", classification: "Baixo" },
    { sampleCode: "P01", parameterCode: "K", value: "142", unit: "mg/dm³", classification: "Adequado" },
    { sampleCode: "P02", parameterCode: "pH_H2O", value: "5,6", unit: "", classification: "Baixo" },
    { sampleCode: "P02", parameterCode: "Al", value: "0,8", unit: "cmolc/dm³", classification: "Alto" },
    { sampleCode: "P02", parameterCode: "V%", value: "52", unit: "%", classification: "Baixo" },
    { sampleCode: "P03", parameterCode: "pH_H2O", value: "5,0", unit: "", classification: "Muito baixo" },
    { sampleCode: "P03", parameterCode: "Al", value: "1,4", unit: "cmolc/dm³", classification: "Muito alto" },
    { sampleCode: "P03", parameterCode: "CTC", value: "8,9", unit: "cmolc/dm³", classification: "Adequado" },
    { sampleCode: "P04", parameterCode: "P_Mehlich", value: "6,2", unit: "mg/dm³", classification: "Muito baixo" },
    { sampleCode: "P05", parameterCode: "Ca", value: "3,4", unit: "cmolc/dm³", classification: "Adequado" },
    { sampleCode: "P06", parameterCode: "Mg", value: "1,6", unit: "cmolc/dm³", classification: "Adequado" },
  ],
} as const;

export const demoNarrative = {
  provider: "motor de texto local",
  isRealLanguageModel: false,
  status: "APPROVED" as const,
  summary:
    "O Talhão Norte mostra acidez crescente do quadrante nordeste para o sudoeste: os pontos P02 e P03 têm pH abaixo de 5,6 e alumínio tóxico acima de 0,8 cmolc/dm³, o que já limita a resposta da soja à adubação de P e K nessa faixa — mesmo com fósforo aplicado, a planta não absorve bem em solo ácido.",
  observations: [
    "3 dos 6 pontos amostrados (P02, P03, P04) estão abaixo da faixa adequada de fósforo — a calagem isolada não resolve isso, o P precisa ser corrigido junto.",
    "Saturação por bases (V%) no ponto P02 está em 52%, abaixo dos 60% recomendados para soja de alta produtividade nesta região.",
  ],
  attentionPoints: [
    "P03 tem alumínio muito alto (1,4 cmolc/dm³) — prioridade de calagem antes da próxima semeadura, não é um ajuste que pode esperar a safra seguinte.",
  ],
  trends: [
    "Comparado à última safra (2024/25), o pH médio do talhão caiu 0,3 ponto — padrão comum em áreas de soja contínua sem calagem de manutenção.",
  ],
  technicalReferences: ["Manual de Calagem e Adubação para os Estados do RS e SC (exemplo ilustrativo)"],
} as const;

export const demoAlerts = [
  { id: "a1", criticality: "ALTA" as const, category: "Interpretação aguardando revisão", title: "AN-2026-0147 · Agropecuária Santa Clara", description: "Interpretação calculada há 2 dias, ainda sem aprovação do responsável técnico." },
  { id: "a2", criticality: "ALTA" as const, category: "Inconsistência de rastreabilidade", title: "AN-2026-0147 · Agropecuária Santa Clara", description: "3 pontos do laudo não batem com nenhum código de coleta registrado." },
  { id: "a3", criticality: "MEDIA" as const, category: "Coleta atrasada", title: "OC-0146 · Sítio Boa Semente", description: "Ordem planejada para 26/08, ainda sem nenhum ponto coletado." },
  { id: "a4", criticality: "MEDIA" as const, category: "Parâmetro sem homologação", title: "Enxofre (S) · perfil Milho", description: "Faixa de suficiência ainda não homologada por agrônomo responsável — resultados ficam retidos." },
  { id: "a5", criticality: "BAIXA" as const, category: "Talhão sem safra vinculada", title: "Talhão Sul · Fazenda Três Irmãos", description: "Talhão cadastrado sem nenhuma safra em andamento." },
] as const;

export const demoInterpretationsLog = [
  { code: "AN-2026-0148", revision: 2, client: "Fazenda Horizonte", field: "Talhão Norte", season: "2026/27", crop: "Soja", cropProfile: "SOJA v2.1", confidence: 88, status: "APPROVED", createdAt: "2026-08-29T14:12:00-03:00" },
  { code: "AN-2026-0147", revision: 1, client: "Agropecuária Santa Clara", field: "Área 03", season: "2026/27", crop: "Milho", cropProfile: "MILHO v1.4", confidence: 61, status: "IN_REVIEW", createdAt: "2026-08-28T09:40:00-03:00" },
  { code: "AN-2026-0145", revision: 1, client: "Fazenda Três Irmãos", field: "Talhão 05", season: "2026/27", crop: "Soja", cropProfile: "SOJA v2.1", confidence: 94, status: "PUBLISHED", createdAt: "2026-08-27T16:05:00-03:00" },
  { code: "AN-2026-0141", revision: 3, client: "Fazenda Horizonte", field: "Talhão Sul", season: "2025/26", crop: "Trigo", cropProfile: "TRIGO v1.0", confidence: 72, status: "SUPERSEDED", createdAt: "2026-06-11T11:20:00-03:00" },
] as const;

export const demoComparison = {
  dimension: "Talhão × Talhão — pH e Fósforo (P)",
  items: [
    { label: "Talhão Norte (Horizonte)", ph: 5.6, p: 8.7 },
    { label: "Talhão Sul (Horizonte)", ph: 6.2, p: 14.3 },
    { label: "Área 03 (Santa Clara)", ph: 5.3, p: 6.9 },
  ],
} as const;

export const demoLibraryProfiles = [
  { crop: "Soja", group: "VERÃO", parameters: 9, status: "ACTIVE" as const },
  { crop: "Milho", group: "VERÃO", parameters: 7, status: "DRAFT" as const },
  { crop: "Trigo", group: "INVERNO", parameters: 6, status: "DRAFT" as const },
  { crop: "Arroz", group: "VERÃO", parameters: 5, status: "DRAFT" as const },
] as const;
