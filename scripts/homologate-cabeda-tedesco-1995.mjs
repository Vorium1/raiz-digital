import pg from "pg";

/**
 * Homologação Cabeda — protocolo laboratorial global Tedesco et al. (1995).
 *
 * Contexto documental:
 * os Relatórios de Ensaio Mondial 1414–1429/2026 declaram no rodapé
 * "Método utilizado nos ensaios: Tedesco, M. J. et al. ... Boletim técnico n° 5 ... 1995".
 *
 * O script:
 * 1. grava o protocolo global em original_payload;
 * 2. troca somente os métodos que haviam sido preenchidos/abreviados sem carregar o protocolo;
 * 3. amplia as chaves de método do perfil SOJA para variantes Tedesco explicitamente rastreadas;
 * 4. corrige a faixa geral de S (>5 = Alto), mantendo o crítico específico da soja (10 mg/dm³)
 *    na nota técnica/regra específica, sem criar um buraco 5–10;
 * 5. registra audit_events.
 *
 * Não altera numeric_value. Não deve rodar em produção.
 */

const { Client } = pg;
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL ausente.");
if (process.env.ALLOW_HOMOLOGATION_WRITE !== "CABEDA_TEDESCO_1995") {
  throw new Error("Fail-closed: defina ALLOW_HOMOLOGATION_WRITE=CABEDA_TEDESCO_1995 somente na homologação isolada.");
}

const client = new Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined });
await client.connect();

const TENANT_ID = "dc3854e1-8721-4041-ba9c-1e8c1657202f";
const ACTOR_ID = "049d3717-84f9-42fc-97d7-aacc22304f5b";
const PROTOCOL = "Tedesco, M. J. et al. Boletim técnico n° 5 - Análises de Solo, Plantas e Outros Materiais. 2 ed. Porto Alegre, 1995.";

const METHODS = {
  B: "Água quente, colorimetria com curcumina",
  S: "Ca(H2PO4)2 500mg P/L, turbidimetria",
  MN: "KCl 1 mol/L (Tedesco 1995)",
  CU: "HCl 0,1 mol/L (Tedesco 1995)",
  ZN: "HCl 0,1 mol/L (Tedesco 1995)",
};

async function main() {
  await client.query("BEGIN");
  try {
    const analyses = await client.query(
      `SELECT id::text, code FROM analyses
       WHERE tenant_id=$1::uuid AND code = ANY($2::text[])
       ORDER BY code FOR UPDATE`,
      [TENANT_ID, ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"]],
    );
    if (analyses.rowCount !== 3) throw new Error(`Esperadas 3 análises Cabeda; encontradas ${analyses.rowCount}.`);

    const before = await client.query(
      `SELECT lr.id::text, a.code AS analysis_code, ls.laboratory_code, lr.parameter_code,
              lr.analytical_method, lr.original_payload
       FROM lab_results lr
       JOIN lab_samples ls ON ls.id=lr.lab_sample_id AND ls.tenant_id=lr.tenant_id
       JOIN analyses a ON a.id=ls.analysis_id AND a.tenant_id=ls.tenant_id
       WHERE a.tenant_id=$1::uuid
         AND a.code = ANY($2::text[])
         AND lr.parameter_code = ANY($3::text[])
       ORDER BY a.code,ls.laboratory_code,lr.parameter_code`,
      [TENANT_ID, ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"], Object.keys(METHODS)],
    );

    for (const [parameterCode, canonicalMethod] of Object.entries(METHODS)) {
      await client.query(
        `UPDATE lab_results lr
         SET analytical_method=$4,
             original_payload=coalesce(lr.original_payload,'{}'::jsonb)
               || jsonb_build_object(
                    'protocol',$5::text,
                    'rawMethod',coalesce(lr.original_payload->>'rawMethod',lr.analytical_method),
                    'methodDerivedFromProtocol',true,
                    'protocolId','TEDESCO_1995'
                  )
         FROM lab_samples ls, analyses a
         WHERE lr.lab_sample_id=ls.id
           AND ls.analysis_id=a.id
           AND a.tenant_id=$1::uuid
           AND a.code=ANY($2::text[])
           AND lr.parameter_code=$3`,
        [TENANT_ID, ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"], parameterCode, canonicalMethod, PROTOCOL],
      );
    }

    // O protocolo global também é registrado nos demais resultados, sem alterar o método que já está correto.
    await client.query(
      `UPDATE lab_results lr
       SET original_payload=coalesce(lr.original_payload,'{}'::jsonb)
         || jsonb_build_object('protocol',$3::text,'protocolId','TEDESCO_1995')
       FROM lab_samples ls, analyses a
       WHERE lr.lab_sample_id=ls.id AND ls.analysis_id=a.id
         AND a.tenant_id=$1::uuid AND a.code=ANY($2::text[])`,
      [TENANT_ID, ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"], PROTOCOL],
    );

    const profile = await client.query(
      `SELECT cp.id::text
       FROM crop_profiles cp
       JOIN crop_seasons cs ON cs.crop_profile_id=cp.id
       JOIN analyses a ON a.crop_season_id=cs.id AND a.tenant_id=$1::uuid
       WHERE a.code='AN-CABEDA-01' AND cp.code='SOJA'
       LIMIT 1`,
      [TENANT_ID],
    );
    const cropProfileId = profile.rows[0]?.id;
    if (!cropProfileId) throw new Error("Perfil SOJA Cabeda não encontrado.");

    const methodAppend = {
      CU: "HCl 0,1 mol/L (Tedesco 1995)",
      ZN: "HCl 0,1 mol/L (Tedesco 1995)",
      MN: "KCl 1 mol/L (Tedesco 1995)",
    };
    for (const [parameterCode, method] of Object.entries(methodAppend)) {
      await client.query(
        `UPDATE crop_profile_parameters
         SET analytical_method_allowed = CASE
               WHEN $3 = ANY(analytical_method_allowed) THEN analytical_method_allowed
               ELSE array_append(analytical_method_allowed,$3)
             END,
             updated_at=clock_timestamp()
         WHERE crop_profile_id=$1::uuid AND parameter_code=$2 AND status='ACTIVE'`,
        [cropProfileId, parameterCode, method],
      );
    }

    await client.query(
      `UPDATE crop_profile_parameters
       SET sufficiency_ranges='[
         {"label":"Baixo","max":2.0},
         {"label":"Médio","min":2.0,"max":5.0},
         {"label":"Alto","min":5.0}
       ]'::jsonb,
       technical_notes = technical_notes || ' | Correção RAIZ 2026-09-19: classe geral de S = Alto >5 mg/dm³; para soja, teor crítico específico = 10 mg/dm³, tratado separadamente da classe geral.',
       updated_at=clock_timestamp()
       WHERE crop_profile_id=$1::uuid AND parameter_code='S' AND status='ACTIVE'`,
      [cropProfileId],
    );

    await client.query(
      `INSERT INTO audit_events
       (tenant_id,actor_user_id,actor_type,action,entity_type,entity_id,before_data,after_data,metadata)
       VALUES ($1::uuid,$2::uuid,'USER','LAB_PROTOCOL_APPLIED','analysis',
               (SELECT id FROM analyses WHERE tenant_id=$1::uuid AND code='AN-CABEDA-01'),
               $3::jsonb,$4::jsonb,$5::jsonb)`,
      [
        TENANT_ID,
        ACTOR_ID,
        JSON.stringify({ resultCount: before.rowCount }),
        JSON.stringify({ protocolId: "TEDESCO_1995", affectedParameters: Object.keys(METHODS) }),
        JSON.stringify({
          analyses: ["AN-CABEDA-01", "AN-CABEDA-02", "AN-CABEDA-03"],
          protocol: PROTOCOL,
          source: "Mondial Relatórios de Ensaio 1414-1429/2026",
          purpose: "document-level protocol resolution",
        }),
      ],
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, analyses: analyses.rows.map((r) => r.code), protocol: "TEDESCO_1995", touchedResults: before.rowCount }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode=1;
}).finally(() => client.end());
