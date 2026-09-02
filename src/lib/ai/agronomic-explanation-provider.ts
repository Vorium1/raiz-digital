import type { EngineResult } from "@/domain/agronomic-engine";

/**
 * Interface desacoplada para a futura camada de IA da RAIZ Digital.
 *
 * NENHUM provedor está conectado nesta fase — nenhuma dependência de IA foi
 * instalada, nenhuma chave de API existe, nenhuma chamada de rede acontece.
 * Este arquivo existe só para que, quando autorizado, um adaptador concreto
 * (ex.: um `AnthropicExplanationProvider` num arquivo separado) possa
 * implementar `AgronomicExplanationProvider` sem que o motor determinístico
 * ou as telas que o consomem precisem ser reescritos.
 *
 * O que a interface já impede, pelo próprio formato dos tipos:
 *  - a IA só recebe `engineResult`, ou seja, a saída já calculada e
 *    homologada do motor determinístico — nunca o laudo cru;
 *  - a IA só pode devolver texto (`narrative`), nunca um `classification`,
 *    `sufficiencyRanges` ou qualquer campo numérico — ela não tem como
 *    substituir uma regra agronômica porque o tipo de retorno não tem onde
 *    colocar uma;
 *  - toda chamada é assíncrona e pode não estar disponível — quem consome
 *    isto deve tratar `null` como o estado normal desta fase, não como erro.
 */

export type AgronomicExplanationRequest = {
  /** Saída já calculada pelo motor determinístico — fatos, classificações, confiança e trace. */
  engineResult: EngineResult;
  cropName: string | null;
  seasonLabel: string;
  /** Para quem o texto deve ser escrito — muda o vocabulário, nunca o conteúdo técnico. */
  audience: "AGRONOMO" | "PRODUTOR";
};

export type AgronomicExplanationResult = {
  narrative: string;
  generatedAt: string;
  /** Avisos que devem acompanhar o texto sempre que exibido (ex.: "revisão humana pendente"). */
  disclaimers: string[];
};

export interface AgronomicExplanationProvider {
  readonly name: string;
  explain(request: AgronomicExplanationRequest): Promise<AgronomicExplanationResult>;
}

/**
 * Ponto único de resolução do provedor de IA. Retorna `null` enquanto nenhum
 * provedor estiver autorizado e conectado — hoje, sempre. Quando uma
 * integração futura for aprovada, ela é registrada aqui, sem tocar em quem
 * chama esta função.
 */
export function resolveAgronomicExplanationProvider(): AgronomicExplanationProvider | null {
  return null;
}
