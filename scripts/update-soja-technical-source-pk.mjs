import { Pool } from "pg";

/**
 * Completa o conteúdo da fonte técnica real da Soja (Manual CQFS-RS/SC 2016) com a tabela de
 * fósforo/potássio que faltava -- o parágrafo já existente só descrevia o MÉTODO de interpretação
 * (Mehlich-1, classes de argila/CTC), sem os números de dose em si. Sem essa tabela no `content`, o
 * pipeline de prescrição por IA (`claude-prescription-provider.ts`, regra "só recomenda se a fonte
 * técnica tiver uma tabela real e citável") não tinha como gerar uma recomendação de P/K pra soja --
 * só omitir com nota em `missingInformation`. Os números vêm do mesmo item 6.1.18 (p.130) já validado
 * e testado em `src/domain/fertilizer-dose-engine.ts` (SOJA_DOSE_TABLE, 42 cenários aprovados),
 * escritos aqui em prosa no MESMO formato já usado nos parágrafos de Milho/Trigo desta biblioteca.
 *
 * Fica em DRAFT -- não promove a fonte técnica sozinho, só completa o conteúdo pra quando um curador
 * da plataforma revisar e aprovar (mesma disciplina já usada pro crop_profile da Soja).
 */

const SOURCE_ID = "26e5166b-b509-4e2a-bbe2-3ea263285034";

const PK_PARAGRAPH =
  "Adubação de fósforo e potássio da soja (kg de P2O5/ha e kg de K2O/ha, por classe de interpretação do solo e número do cultivo, pressupõe rendimento ≤3 t/ha): Muito baixo -> P2O5 155 (1º cultivo)/95 (2º); K2O 155/115. Baixo -> 95/75; 115/95. Médio -> 85/45; 105/75. Alto -> 45/45; 75/75. Muito alto -> 0/≤45; 0/≤75. Para rendimento acima de 3 t/ha, somar 15 kg/ha de P2O5 e 25 kg/ha de K2O por tonelada adicional de grãos. A adubação nitrogenada não é recomendada para a soja devido à fixação biológica de N por rizóbio (inoculação obrigatória). Enxofre: se o teor de S do solo for menor que 10 mg/dm³, aplicar 20 kg/ha de S-SO4. Molibdênio: 12-25 g Mo/ha via semente ou 25-50 g Mo/ha via foliar, indicado só em solos com pH(H2O) < 5,5 E sintoma visual de deficiência de N (amarelecimento generalizado) -- não é gatilho de laboratório isolado.";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const existing = await pool.query("SELECT content, status FROM technical_sources WHERE id = $1", [SOURCE_ID]);
const row = existing.rows[0];
if (!row) throw new Error("Fonte técnica da Soja não encontrada -- verifique o SOURCE_ID.");
if (row.content.includes("Adubação de fósforo e potássio da soja")) {
  console.log("Tabela de P/K já presente no conteúdo -- nada a fazer.");
} else {
  const newContent = `${row.content}\n\n${PK_PARAGRAPH}`;
  await pool.query("UPDATE technical_sources SET content = $1, updated_at = now() WHERE id = $2", [newContent, SOURCE_ID]);
  console.log(`Conteúdo atualizado (status permanece '${row.status}', sem promoção automática).`);
}

await pool.end();
