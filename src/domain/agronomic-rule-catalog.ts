export type AgronomicRuleStatus = "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW" | "INSUFFICIENT_EVIDENCE";

export type AgronomicRuleManifest = {
  ruleId: string;
  version: string;
  crop: string;
  subject: string;
  region: string;
  status: AgronomicRuleStatus;
  sourceSnapshotId: string;
  sourceTitle: string;
  sourceInstitution: string;
  sourceYear: number;
  sourceLocator: string | null;
  sourceUrl: string | null;
};

export const RESEARCH_SNAPSHOT_ID = "RAIZ-WORK-RESEARCH-2026-09-14";
export const CROSSCHECK_SNAPSHOT_ID = "RAIZ-WORK-GEMINI-CROSSCHECK-2026-09-14";
export const RESEARCH_RULE_CATALOG_SCHEMA_VERSION = "1.1";

export const SOURCE_LEDGER = Object.freeze({
  cqfs2016: { sha256: "b2c5122a05962dc1b32d8f9265bef99a357d748cc6a21a4dd1f1502f1d070104", bytes: 30_973_588 },
  sosbai2025: { sha256: "7e2b2de2d74993ccd6f92d56f93f1d062f1bd6e04bfd162b6aff90febd7689a5", bytes: 17_060_663 },
  canola2009: { sha256: "1d11ca7de832835e1c6487c307288f4c72f719c0c393940c2e8b60d2e19b668a", bytes: 13_917_003 },
  canola2022: { sha256: "e3ea65423f14fe0afecc0fcd4ad4aaf67d9dfe5f233bcfb51326f792d80e0a95", bytes: 3_876_332 },
  soja2020: { sha256: "a3bc85a7fbe29a6630583803fa54da38614c36da225b7e216ccb363ff166701e", bytes: 5_935_809 },
  gesso2005: { sha256: "39125c7661c38d009b9d38c0509983ace63b8e3a7bd12e1d654ff2716f800bc4", bytes: 1_149_925 },
});

const V = "1.0.0";
const V_CROSSCHECK = "1.1.0";
const CQFS_2016_URL = "https://www.sbcs-nrs.org.br/docs/Manual_de_Calagem_e_Adubacao_para_os_Estados_do_RS_e_de_SC-2016.pdf";
const SOSBAI_2025_URL = "https://www.sosbai.com.br/uploads/documentos/recomendacoes-tecnicas-da-pesquisa-para-o-sul-do-brasil_310.pdf";
const SOJA_2020_URL = "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1123928/1/SP-17-2020-online-1.pdf";
const SOJA_RS_SC_2025_URL = "https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/1183120/1/Indicacoes2025.pdf";
const TRIGO_2026_URL = "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1188314/1/Informacoes-Tecnicas-2026-online-CGPE.pdf";
const PAB_SPATIAL_URL = "https://www.scielo.br/j/pab/a/wtsHg7XP3xBD5XqVhtY7Gyp/?lang=pt";
const UNL_G1503_URL = "https://extensionpubs.unl.edu/publication/g1503/na/html/view";

export const AGRONOMIC_RULES: ReadonlyArray<AgronomicRuleManifest> = Object.freeze([
  { ruleId: "PK-SOJA-CQFS-2016", version: V, crop: "SOJA", subject: "P_K", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "Tabela 6.1.2 p.106; item 6.1.18 p.130", sourceUrl: CQFS_2016_URL },
  { ruleId: "PK-SOJA-RS-SC-2025", version: V_CROSSCHECK, crop: "SOJA", subject: "P_K", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027", sourceInstitution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / UPF", sourceYear: 2025, sourceLocator: "item 2.5.2, pp.37-44; Tabelas 2.4-2.8; valores-base atribuídos à CQFS-RS/SC 2016", sourceUrl: SOJA_RS_SC_2025_URL },
  { ruleId: "PK-MILHO-CQFS-2016", version: V, crop: "MILHO", subject: "P_K", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "Tabela 6.1.2 p.106; item 6.1.14 p.127", sourceUrl: CQFS_2016_URL },
  { ruleId: "PK-TRIGO-CQFS-2016", version: V, crop: "TRIGO", subject: "P_K", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "Tabela 6.1.2 p.106; item 6.1.21 p.133", sourceUrl: CQFS_2016_URL },
  { ruleId: "N-MILHO-CQFS-2016", version: V, crop: "MILHO", subject: "N", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "pp.125-127", sourceUrl: CQFS_2016_URL },
  { ruleId: "N-TRIGO-EMBRAPA-2026", version: V, crop: "TRIGO", subject: "N", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Informações técnicas para trigo e triticale, safra 2026", sourceInstitution: "Embrapa Trigo", sourceYear: 2026, sourceLocator: "Tabela 3, pp.29-33", sourceUrl: TRIGO_2026_URL },
  { ruleId: "N-CANOLA-CQFS-2016", version: V, crop: "CANOLA", subject: "N", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC + Tecnologia para produção de canola", sourceInstitution: "CQFS/Embrapa Trigo", sourceYear: 2016, sourceLocator: "CQFS p.119; Embrapa 2009 pp.50-53", sourceUrl: CQFS_2016_URL },
  { ruleId: "N-GRAMINEA-INVERNO-CQFS-2016", version: V, crop: "PASTAGEM_INVERNO", subject: "N", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "pp.141-147", sourceUrl: CQFS_2016_URL },

  // Arroz: a regra ampla continua bloqueada; somente sub-regras fechadas da SOSBAI 2025 foram liberadas.
  { ruleId: "N-ARROZ-SOSBAI-2025", version: V, crop: "ARROZ_IRRIGADO", subject: "N", region: "Sul do Brasil", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "Tabela 4.5, pp.46-47", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "N-ARROZ-CONTINUO-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "N_TOTAL_ARROZ_CONTINUO", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "Tabela 4.5 p.46; notas pp.46-47", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "P-ARROZ-CONTINUO-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "P2O5_ARROZ_CONTINUO", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "Tabela 4.6 p.47", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "K-ARROZ-CONTINUO-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "K2O_ARROZ_CONTINUO", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "Tabela 4.7 p.48; Mehlich-1; nota 1: +20 kg/ha K2O quando CTC pH 7,0 >15,0 cmolc/dm3", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "S-ARROZ-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "S", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "p.49: S <10 mg/dm3 por fosfato de cálcio 500 mg/L; resposta limitada a 20–30 kg S/ha", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "FE-ARROZ-RISCO-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "RISCO_TOXIDEZ_FE", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "p.53, estimativa Fe e Tabela 4.8", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "CALAGEM-ARROZ-SECO-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "CALAGEM_SOLO_SECO", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "p.42, texto e Tabela 4.1; conflito lógico identificado", sourceUrl: SOSBAI_2025_URL },
  { ruleId: "CALAGEM-ARROZ-PREG-TRANS-SOSBAI-2025", version: V_CROSSCHECK, crop: "ARROZ_IRRIGADO", subject: "CALAGEM_PREG_TRANS_CA_MG", region: "Sul do Brasil", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Recomendações técnicas da pesquisa para o Sul do Brasil 2025", sourceInstitution: "SOSBAI", sourceYear: 2025, sourceLocator: "p.42, Tabela 4.1: pré-germinado/transplante; V <=40%; exceção Ca >=4,0 e Mg >=1,0 cmolc/dm3; NC=(40-V)/100*CTCpH7", sourceUrl: SOSBAI_2025_URL },

  { ruleId: "S-SOJA-RS-SC-2025", version: V_CROSSCHECK, crop: "SOJA", subject: "S", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027", sourceInstitution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / UPF", sourceYear: 2025, sourceLocator: "item 2.5.3 Enxofre, p.45; superfície >10 mg/dm3 em 0-10/0-20; valor 8,5 mg/dm3 em 20-40; quando insuficiente, 20 kg S/ha", sourceUrl: SOJA_RS_SC_2025_URL },
  { ruleId: "S-TRIGO-EMBRAPA-2026", version: V, crop: "TRIGO", subject: "S", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Informações técnicas para trigo e triticale, safra 2026", sourceInstitution: "Embrapa Trigo", sourceYear: 2026, sourceLocator: "p.33", sourceUrl: TRIGO_2026_URL },
  { ruleId: "S-CANOLA-CQFS-2016", version: V, crop: "CANOLA", subject: "S", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Tecnologia para produção de canola no Rio Grande do Sul", sourceInstitution: "Embrapa Trigo/CQFS", sourceYear: 2009, sourceLocator: "p.53", sourceUrl: "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/853791/1/TecnologiaparaaproducaodeCanola.pdf" },

  // Mo: perfis permanecem em revisão. A edição regional 2025 é atual para RS/SC e conflita em pontos operacionais com o perfil nacional 2020.
  { ruleId: "MO-SOJA-CQFS-2016", version: V_CROSSCHECK, crop: "SOJA", subject: "Mo", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "pp.130-131", sourceUrl: CQFS_2016_URL },
  { ruleId: "MO-SOJA-EMBRAPA-2020", version: V_CROSSCHECK, crop: "SOJA", subject: "Mo", region: "Brasil / aplicação no Sul exige perfil escolhido", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Tecnologias de produção de soja", sourceInstitution: "Embrapa Soja", sourceYear: 2020, sourceLocator: "p.175, seção Cobalto e molibdênio; p.189, aplicação de micronutrientes", sourceUrl: SOJA_2020_URL },
  { ruleId: "MO-SOJA-RS-SC-2025", version: V_CROSSCHECK, crop: "SOJA", subject: "Mo", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027", sourceInstitution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / UPF", sourceYear: 2025, sourceLocator: "item 2.5.4, pp.46-47", sourceUrl: SOJA_RS_SC_2025_URL },

  { ruleId: "MICRO-CLASS-CQFS-2016", version: V_CROSSCHECK, crop: "SOJA_MILHO_TRIGO_CANOLA", subject: "CLASSIFICACAO_B_ZN_CU_MN", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "Métodos pp.55-56; Tabela 6.12 p.98", sourceUrl: CQFS_2016_URL },
  { ruleId: "MICRONUTRIENT-GENERIC-RS-SC", version: V, crop: "GERAL", subject: "B_ZN_CU_MN_DOSE", region: "RS/SC", status: "INSUFFICIENT_EVIDENCE", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Conclusão da pesquisa técnica RAIZ", sourceInstitution: "RAIZ Digital / CQFS", sourceYear: 2026, sourceLocator: "Pesquisa técnica, seção C", sourceUrl: null },

  { ruleId: "GESSO-CERRADO-EMBRAPA-2005", version: V, crop: "GERAL", subject: "GESSO", region: "Cerrado — não RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Uso de gesso agrícola nos solos do Cerrado", sourceInstitution: "Embrapa Cerrados", sourceYear: 2005, sourceLocator: "pp.13-16", sourceUrl: "https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/568533/1/cirtec32.pdf" },
  { ruleId: "GYPSUM-SUBSOIL-DIAGNOSTIC-2018", version: V_CROSSCHECK, crop: "GERAL", subject: "DIAGNOSTICO_GESSO", region: "Sul do Brasil / domínio experimental", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Crop yield responses to gypsum application in Brazilian no-till soils", sourceInstitution: "Tiecher et al.", sourceYear: 2018, sourceLocator: "critério diagnóstico 20-40 cm; revisão de estudos", sourceUrl: "https://www.scielo.br/j/rbcs/a/ctHCYSdpf6Lwh3yJHMXkxzj/?lang=en" },
  { ruleId: "GYPSUM-SOYBEAN-RS-SC-2025", version: V_CROSSCHECK, crop: "SOJA", subject: "GESSAGEM_CONTEXTO_RESPOSTA", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Indicações técnicas para a cultura da soja no Rio Grande do Sul e em Santa Catarina, safras 2025/2026 e 2026/2027", sourceInstitution: "44ª Reunião de Pesquisa de Soja da Região Sul / Embrapa Trigo / UPF", sourceYear: 2025, sourceLocator: "seção 2.4 Gessagem, pp.30-31; meta-análise Pias et al. 2020 como evidência de apoio", sourceUrl: SOJA_RS_SC_2025_URL },
  { ruleId: "GYPSUM-RS-SC-AUTOMATIC", version: V_CROSSCHECK, crop: "GERAL", subject: "GESSO_DOSE_AUTOMATICA", region: "RS/SC", status: "INSUFFICIENT_EVIDENCE", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Pesquisa técnica RAIZ — modelos concorrentes e ausência de regra regional universal", sourceInstitution: "RAIZ Digital / literatura revisada", sourceYear: 2026, sourceLocator: "Pesquisa A-H, seção B", sourceUrl: null },

  { ruleId: "LIME-PRNT", version: V, crop: "GERAL", subject: "CALCARIO_COMERCIAL", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC", sourceInstitution: "CQFS-RS/SC", sourceYear: 2016, sourceLocator: "pp.296-301", sourceUrl: CQFS_2016_URL },
  { ruleId: "PRODUCT-MASS-ALGEBRA", version: V, crop: "GERAL", subject: "PRODUTO_COMERCIAL", region: "qualquer — produto cadastrado", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Manual de Calagem e Adubação RS/SC + garantia declarada do produto", sourceInstitution: "CQFS/registro do produto", sourceYear: 2016, sourceLocator: "pp.304-313", sourceUrl: CQFS_2016_URL },

  // Espacial: métricas e máscara são calculáveis; a decisão de prescrição continua sob gate profissional.
  { ruleId: "VRA-SUPPORT-GATE", version: V, crop: "GERAL", subject: "TAXA_VARIAVEL", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Política de suporte espacial RAIZ baseada em literatura de agricultura de precisão", sourceInstitution: "RAIZ/Embrapa/PAB/Wiley", sourceYear: 2026, sourceLocator: null, sourceUrl: PAB_SPATIAL_URL },
  { ruleId: "SPATIAL-SUPPORT-MASK", version: V_CROSSCHECK, crop: "GERAL", subject: "MASCARA_SUPORTE_ESPACIAL", region: "talhão georreferenciado", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Agricultura de precisão + estudo de variabilidade espacial no RS", sourceInstitution: "Embrapa / Pesquisa Agropecuária Brasileira", sourceYear: 2015, sourceLocator: "casco convexo + polígono; sem extrapolação; NoData preservado", sourceUrl: PAB_SPATIAL_URL },
  { ruleId: "SPATIAL-VALIDATION-METRICS", version: V_CROSSCHECK, crop: "GERAL", subject: "RMSE_MAE_ME", region: "talhão georreferenciado", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Cross-validation strategies for spatially structured data + agricultura de precisão", sourceInstitution: "Roberts et al. / Embrapa", sourceYear: 2017, sourceLocator: "RMSE, MAE, ME; block-CV; sem threshold universal", sourceUrl: "https://onlinelibrary.wiley.com/doi/10.1111/ecog.02881" },
  { ruleId: "VRA-MASS-TOTAL", version: V, crop: "GERAL", subject: "MASSA_PRESCRICAO", region: "RS/SC", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Conservação de massa aplicada à prescrição", sourceInstitution: "RAIZ Digital", sourceYear: 2026, sourceLocator: null, sourceUrl: null },

  { ruleId: "N-TRIGO-QUALIDADE-EMBRAPA-2026", version: V_CROSSCHECK, crop: "TRIGO", subject: "N_QUALIDADE_PROTEINA", region: "RS/SC", status: "REQUIRES_AGRONOMIST_REVIEW", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Informações técnicas para trigo e triticale — 2026", sourceInstitution: "Embrapa Trigo", sourceYear: 2026, sourceLocator: "pp.29-34; N tardio separado do objetivo de rendimento", sourceUrl: TRIGO_2026_URL },
  { ruleId: "CARINATA-RS-SC-NUTRITION", version: V, crop: "CARINATA", subject: "NPKSB", region: "RS/SC", status: "INSUFFICIENT_EVIDENCE", sourceSnapshotId: RESEARCH_SNAPSHOT_ID, sourceTitle: "Conclusão da pesquisa técnica RAIZ — literatura externa não regional", sourceInstitution: "RAIZ Digital / revisão de fontes", sourceYear: 2026, sourceLocator: "Pesquisa técnica, seção E", sourceUrl: null },

  // MAP x DAP: ledger explicativo liberado, mas nunca corrige calagem do talhão por conta própria.
  { ruleId: "MAP-DAP-ACID-LEDGER-UNL-2009", version: V_CROSSCHECK, crop: "GERAL", subject: "EQUIVALENTE_ACIDEZ_LEDGER", region: "denominador e grau declarados", status: "READY_FOR_IMPLEMENTATION", sourceSnapshotId: CROSSCHECK_SNAPSHOT_ID, sourceTitle: "Acidification and alkalinity of nitrogen fertilizers", sourceInstitution: "University of Nebraska", sourceYear: 2009, sourceLocator: "G1503 rev.; tabela de equivalentes por unidade de N", sourceUrl: UNL_G1503_URL },
]);

const RULE_BY_ID = new Map(AGRONOMIC_RULES.map((rule) => [rule.ruleId, rule]));

export function getAgronomicRule(ruleId: string): AgronomicRuleManifest | null {
  return RULE_BY_ID.get(ruleId) ?? null;
}

export function evaluateAgronomicRuleAutomation(ruleId: string): {
  allowed: boolean;
  status: AgronomicRuleStatus | "UNKNOWN_RULE";
  reason: string | null;
  rule: AgronomicRuleManifest | null;
} {
  const rule = getAgronomicRule(ruleId);
  if (!rule) return { allowed: false, status: "UNKNOWN_RULE", reason: "Regra não existe no catálogo versionado.", rule: null };
  if (rule.status === "READY_FOR_IMPLEMENTATION") return { allowed: true, status: rule.status, reason: null, rule };
  if (rule.status === "REQUIRES_AGRONOMIST_REVIEW") return { allowed: false, status: rule.status, reason: "A fonte ou a combinação de condições exige decisão profissional antes de virar dose oficial.", rule };
  return { allowed: false, status: rule.status, reason: "Não há evidência regional suficiente para uma dose automática nesta versão do catálogo.", rule };
}

export function buildRuleTrace(ruleId: string) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  if (!decision.rule) throw new Error(`Regra agronômica desconhecida: ${ruleId}`);
  return {
    ruleId: decision.rule.ruleId,
    ruleVersion: decision.rule.version,
    sourceSnapshotId: decision.rule.sourceSnapshotId,
    sourceTitle: decision.rule.sourceTitle,
    sourceInstitution: decision.rule.sourceInstitution,
    sourceYear: decision.rule.sourceYear,
    sourceLocator: decision.rule.sourceLocator,
    executionStatus: decision.rule.status,
  };
}

const STATUS_SEVERITY: Record<AgronomicRuleStatus, number> = {
  READY_FOR_IMPLEMENTATION: 0,
  REQUIRES_AGRONOMIST_REVIEW: 1,
  INSUFFICIENT_EVIDENCE: 2,
};

export function resolveAgronomicExecutionStatus(
  ruleId: string,
  runtimeStatus?: AgronomicRuleStatus | null,
): AgronomicRuleStatus {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  if (!decision.rule) throw new Error(`Regra agronômica desconhecida: ${ruleId}`);
  if (!runtimeStatus) return decision.rule.status;
  return STATUS_SEVERITY[runtimeStatus] > STATUS_SEVERITY[decision.rule.status]
    ? runtimeStatus
    : decision.rule.status;
}
