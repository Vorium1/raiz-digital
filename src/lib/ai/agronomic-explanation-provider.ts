import type { AgronomicEvidencePackage } from "@/lib/ai/evidence-package";
import type { AgronomicNarrative } from "@/lib/ai/agronomic-narrative-schema";
import { localTemplateNarrativeProvider } from "@/lib/ai/providers/template-narrative-provider";

/**
 * Interface desacoplada da camada de IA agronômica.
 *
 * O que o formato já impede, estruturalmente:
 *  - a IA só recebe `evidence`, o pacote já filtrado por tenant/RBAC — nunca
 *    acesso a banco;
 *  - a IA só pode devolver uma `AgronomicNarrative` (texto), nunca um campo
 *    de classificação, faixa ou dose — o tipo não tem onde colocar isso;
 *  - toda chamada é assíncrona e pode falhar — quem consome trata ausência
 *    de provedor como estado normal, nunca como erro.
 */

export type AgronomicExplanationRequest = {
  evidence: AgronomicEvidencePackage;
  audience: "AGRONOMO" | "PRODUTOR";
};

export type AgronomicExplanationResult = {
  narrative: AgronomicNarrative;
  provider: string;
  model: string;
  promptVersion: string;
  generatedAt: string;
  /** true quando o provedor é um formatador determinístico local, não um modelo de linguagem real. */
  isRealLanguageModel: boolean;
  tokensUsed?: number;
  costUsd?: number;
};

export interface AgronomicExplanationProvider {
  readonly name: string;
  readonly model: string;
  readonly isRealLanguageModel: boolean;
  explain(request: AgronomicExplanationRequest): Promise<AgronomicExplanationResult>;
}

/**
 * Ponto único de resolução do provedor. Hoje sempre devolve o formatador
 * local (`localTemplateNarrativeProvider`) — determinístico, sem custo,
 * sem chave de API, sem chamada de rede. Nenhum provedor de IA generativa
 * real está conectado; isso só deve acontecer mediante autorização
 * explícita e configuração de uma chave de API no servidor (nunca no
 * navegador). Trocar de provedor é só mudar o retorno desta função.
 */
export function resolveAgronomicExplanationProvider(): AgronomicExplanationProvider {
  return localTemplateNarrativeProvider;
}
