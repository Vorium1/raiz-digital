import { createHash } from "node:crypto";
import type { AssistantScreenContext } from "@/lib/ai/assistant-screen";
import type { AssistantEvidenceResult } from "@/lib/ai/assistant-evidence";
import type { AgronomicEvidencePackage } from "@/lib/ai/evidence-package";

/**
 * Fechamento técnico da Fase 4A (2º pedido, item 1) — `EvidenceManifest`/`buildEvidenceManifest`, movidos
 * pra este arquivo próprio.
 *
 * Achado real do diretor: `EvidenceManifest` já declarava `ruleRefs`/`technicalSourceIds`, mas
 * `/api/assistant` chamava `buildEvidenceManifest()` sem fornecer nenhum dos dois — os campos ficavam
 * SEMPRE vazios, mesmo quando o Evidence Package de análise (`AgronomicEvidencePackage`) já tinha
 * `ruleUsed`/`technicalSources` reais. Corrigido derivando automaticamente do próprio Evidence Package
 * Result (Bloco 2) em vez de depender de cada chamador lembrar de repassar isso manualmente.
 *
 * Deliberadamente puro (só `import type`, nenhum import de valor de módulo com classe/banco) — testável
 * com `node --experimental-strip-types` sem precisar de banco real. `assistant-evidence.ts` importa
 * `reports.ts`/`interpretations.ts`, que têm classes com parâmetro de construtor TypeScript incompatíveis
 * com o strip-types de Node; como este arquivo só importa TIPOS de lá (`import type`), nada disso é
 * carregado em tempo de execução.
 */

export type EvidenceManifest = {
  screenContext: AssistantScreenContext;
  entityIds: Record<string, string>;
  builtAt: string;
  ruleRefs: string[];
  technicalSourceIds: string[];
  evidenceHash: string;
  factsSnapshot: Array<{ label: string; value: string }>;
};

const MANIFEST_FACTS_LIMIT = 20;

/**
 * Referência legível da regra técnica usada (código/nome do perfil de cultura + versão + prefixo do hash
 * de conteúdo) — só quando o Evidence Package de análise tem uma regra de fato identificável. `ruleUsed`
 * pode existir (há uma interpretação) mas vir com todos os campos `null` quando não há
 * `crop_profile_id` associado — nesse caso não registra nada (nunca um rótulo genérico "regra usada" sem
 * identificação real).
 */
function deriveRuleRefFromAnalysis(evidence: AgronomicEvidencePackage): string | null {
  const rule = evidence.ruleUsed;
  if (!rule) return null;
  const name = rule.cropProfileCode ?? rule.cropProfileName;
  if (!name) return null;
  const version = rule.version ? `@${rule.version}` : "";
  const hash = rule.contentHash ? `#${rule.contentHash.slice(0, 12)}` : "";
  return `${name}${version}${hash}`;
}

/** IDs reais das fontes técnicas presentes no Evidence Package — nunca inventados quando ausentes. */
function deriveTechnicalSourceIds(evidence: AgronomicEvidencePackage): string[] {
  return evidence.technicalSources.map((source) => source.id).filter((id): id is string => Boolean(id));
}

function deriveManifestRefs(evidenceResult: AssistantEvidenceResult): { ruleRefs: string[]; technicalSourceIds: string[] } {
  if (evidenceResult.found && evidenceResult.kind === "analysis") {
    const ruleRef = deriveRuleRefFromAnalysis(evidenceResult.evidence);
    return { ruleRefs: ruleRef ? [ruleRef] : [], technicalSourceIds: deriveTechnicalSourceIds(evidenceResult.evidence) };
  }
  // Nenhum outro contexto (dashboard/propriedade/talhão/comparativo/relatório/inteligência/mapa) carrega
  // regra técnica ou fonte homologada no Evidence Package hoje -- arrays vazios são a resposta honesta,
  // não uma lacuna de implementação.
  return { ruleRefs: [], technicalSourceIds: [] };
}

/**
 * Monta o manifesto de auditoria a partir do Evidence Package Result já resolvido (Bloco 2). Nunca copia
 * o Evidence Package inteiro nem histórico bruto pra dentro de `ai_generations` -- só o hash (prova de
 * integridade, reconstruível reconsultando o banco com os mesmos `entityIds`) e um recorte explicitamente
 * limitado (20 itens) dos fatos que a resposta final efetivamente citou.
 *
 * `extraRuleRefs` existe pra regras que a CAMADA DE RESPOSTA calcula (ex.: um futuro `patterns[].ruleRef`
 * de predominância), que o Evidence Package sozinho não tem como saber -- mesclado e deduplicado com o que
 * foi derivado automaticamente.
 */
export function buildEvidenceManifest(input: { screenContext: AssistantScreenContext; evidenceResult: AssistantEvidenceResult; factsUsed: Array<{ label: string; value: string }>; extraRuleRefs?: string[] }): EvidenceManifest {
  const evidenceForHash = input.evidenceResult.found ? input.evidenceResult.evidence : null;
  const evidenceHash = createHash("sha256").update(JSON.stringify(evidenceForHash)).digest("hex");
  const derived = deriveManifestRefs(input.evidenceResult);
  const ruleRefs = Array.from(new Set([...derived.ruleRefs, ...(input.extraRuleRefs ?? [])]));
  return {
    screenContext: input.screenContext,
    entityIds: input.evidenceResult.entityIds,
    builtAt: new Date().toISOString(),
    ruleRefs,
    technicalSourceIds: derived.technicalSourceIds,
    evidenceHash,
    factsSnapshot: input.factsUsed.slice(0, MANIFEST_FACTS_LIMIT),
  };
}
