/**
 * Catálogo de parâmetros DADO AUXILIAR por cultura -- insumo/contexto de cálculo, nunca um alvo de
 * classificação estática (ver `ClassificationRole` em `agronomic-engine.ts`). Fica FORA do motor
 * determinístico de propósito: é uma decisão por cultura/edição de manual técnico, não uma regra
 * universal do motor (outra cultura/metodologia pode, um dia, ter faixa estática pra pH ou Al, por
 * exemplo). Quem monta o `CropProfileDef.auxiliaryParameterCodes` a partir daqui é a camada de
 * repositório (`interpretations.ts`), nunca o motor.
 *
 * Achado real, auditoria RAIZ_2.0/Cabeda (2026-09-11): antes deste catálogo existir, um dado auxiliar
 * (ex.: CLAY, usado só como condição de P) e um parâmetro genuinamente ainda não homologado (ex.: CTC)
 * devolviam o MESMO código do motor (`PARAMETER_NOT_IN_PROFILE`) -- a UI não tinha como diferenciar "isso
 * nunca vai ter faixa própria, por desenho da fonte técnica" de "isso só precisa de um agrônomo revisar".
 */
export const AUXILIARY_PARAMETER_CODES_BY_CROP: Record<string, string[]> = {
  /**
   * SOJA, CQFS-RS/SC 2016 (mesma fonte de `seed-soja-cqfs-2016.mjs`):
   * - CLAY: nunca foi um alvo de classificação -- é só a variável que decide qual das 4 faixas de P
   *   (por classe de argila) se aplica a cada ponto.
   * - SMP: índice usado pelo cálculo de dose de calcário (Tabela 5.2) -- não é classificado sozinho
   *   nesta edição.
   * - H_AL: só entra como componente da fórmula de CTC (Ca+Mg+K+(H+Al)) e do cálculo de V%/m% -- não
   *   classificável isoladamente.
   * - PH: a edição 2016 não publica mais faixa fixa de pH -- usa SMP + pH de referência por cultura pra
   *   calcular a dose de calcário diretamente, tratando pH como insumo desse cálculo, não como rótulo de
   *   faixa "Baixo/Médio/Alto".
   * - AL: a edição 2016 não publica mais faixa fixa de Al³⁺ isolado -- vira insumo do cálculo de m%
   *   (saturação por alumínio), critério auxiliar de decisão de calagem, não um rótulo de classe.
   */
  SOJA: ["CLAY", "SMP", "H_AL", "PH", "AL"],
};

export function auxiliaryParameterCodesFor(cropCode: string | null | undefined): string[] {
  return cropCode ? (AUXILIARY_PARAMETER_CODES_BY_CROP[cropCode] ?? []) : [];
}
