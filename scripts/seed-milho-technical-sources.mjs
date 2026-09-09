import pg from "pg";

/**
 * Fontes técnicas narrativas (não são faixa de suficiência -- são conteúdo
 * pra IA de prescrição ler e justificar dose real, via `technicalSources`)
 * pra MILHO. Duas partes com nível de confiança diferente, registrado no
 * próprio `technical_notes`:
 *
 * 1. Tabela de N (semeadura+cobertura, por MO e cultura antecedente) e
 *    tabela de P2O5/K2O (por classe de interpretação e nº de cultivo) --
 *    CONFERIDAS PALAVRA POR PALAVRA por Claude Code direto contra o PDF
 *    oficial da CQFS-RS/SC 2016 (capítulo 6.1.14 - MILHO, p.125-127) em
 *    2026-09-04. Confiança alta.
 * 2. pH de referência do milho = 6,0 (mesmo grupo da soja, trigo, cevada,
 *    aveia, triticale, canola) -- também conferido direto no PDF (Tabela
 *    5.1, p.não numerada, grupo "pH 6,0"). Confiança alta.
 *
 * O restante da pesquisa que o diretor trouxe (organomineral, fosfato
 * natural, bioinsumos, gráfico de disponibilidade por pH) fica registrado
 * à parte, como fonte geral (não específica de milho), com confiança mais
 * baixa -- Claude Code NÃO teve como conferir essas citações direto na
 * fonte primária (são de documentos que não estão baixados localmente).
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const MILHO_N_PK_SOURCE = {
  title: "Manual de Calagem e Adubação para os Estados do Rio Grande do Sul e de Santa Catarina, 11ª ed. (2016) — capítulo Milho",
  institution: "CQFS-RS/SC - SBCS Núcleo Regional Sul",
  editionYear: 2016,
  content: `Adubação nitrogenada do milho (semeadura + cobertura, kg de N/ha), em função da matéria orgânica do solo e da cultura antecedente (pressupõe expectativa de rendimento de aproximadamente 6 t/ha de grãos): MO ≤2,5% -> 70 (antecessora leguminosa) / 80 (consorciação ou pousio) / 90 (antecessora gramínea); MO 2,6-5,0% -> 50/60/70; MO >5,0% -> ≤40/≤40/≤50. Ajustes: se a massa seca da leguminosa antecessora for alta (>3 t/ha), reduzir até 20 kg/ha; se a do nabo/consórcio for baixa (≤4 t/ha), aumentar até 20 kg/ha; se a da gramínea for alta (>4 t/ha), aumentar 20 a 40 kg/ha; para expectativa de rendimento acima de 6 t/ha, somar 15 kg/ha de N por tonelada adicional de grãos; acima de 10 t/ha, aumentar 20 a 40%; densidade acima de 65.000 plantas/ha, aumentar 10 kg/ha a cada 5.000 plantas adicionais; em rotação anual com soja, pode-se reduzir até 20%. Parcelamento: convencional -- 10 a 30 kg/ha na semeadura, restante em cobertura em V4-V6; plantio direto -- 20 a 40 kg/ha na semeadura sobre resíduo de gramínea (10 a 20 kg/ha sobre resíduo de leguminosa), com boa resposta à antecipação da cobertura para V3-V5, especialmente nos primeiros anos do sistema. Doses elevadas podem ser fracionadas 50% em V4-V6 e 50% em V8-V9. Fonte de N: sob boa umidade (15-30mm de chuva após aplicação), sulfato de amônio, nitrato de amônio e ureia têm eficiência semelhante -- usar a de menor custo por unidade de N; em aplicação superficial sem boa umidade, sulfato/nitrato de amônio superam a ureia (perdas por volatilização).

Adubação de fósforo e potássio do milho (kg de P2O5/ha e kg de K2O/ha, por classe de interpretação do solo e número do cultivo em que a dose é aplicada, pressupõe rendimento ≤6 t/ha): Muito baixo -> P2O5 200 (1º cultivo)/140 (2º); K2O 140/100. Baixo -> 140/120; 100/80. Médio -> 130/90; 90/60. Alto -> 90/90; 60/60. Muito alto -> 0/≤90; 0/≤60. Para rendimento acima de 6 t/ha, somar 15 kg/ha de P2O5 e 10 kg/ha de K2O por tonelada adicional de grãos. A dose de correção gradual (2/3 no 1º cultivo, 1/3 no 2º) vale para as classes Muito baixo e Baixo; na classe Médio, a dose de correção é aplicada integralmente no 1º cultivo; na classe Alto, é adubação de manutenção; na classe Muito alto, pode variar de zero até manutenção, visando reduzir gradualmente o teor até a classe Alto.

pH de referência do milho para calagem: 6,0 -- mesmo grupo da soja, trigo, cevada, aveia, triticale e canola (Tabela 5.1 do manual). Critério de decisão de calagem: corrigir quando pH em água < 5,5 (o alumínio trocável só reaparece abaixo desse valor). Correspondência pH-saturação por bases (V%) usada no cálculo da dose pelo método da saturação por bases: pH 5,5 = V 65%; pH 6,0 = V 75%; pH 6,5 = V 85%.`,
};

const BOAS_PRATICAS_MODERNAS_SOURCE = {
  title: "Boas práticas e insumos modernos (organomineral, fosfato natural, bioinsumos, disponibilidade por pH) — pesquisa compilada, confiança média",
  institution: "Compilação cruzada (Claude + GPT, 2026-09-04) de múltiplas fontes (Embrapa, CQFS-RS/SC, artigos revisados por pares)",
  editionYear: null,
  content: `AVISO DE CONFIANÇA: este conteúdo vem de duas pesquisas por IA independentes (Claude e GPT, 2026-09-04), cruzadas entre si -- onde as duas bateram, a confiança é mais alta; onde só uma citou algo, fica marcado. Nenhuma das citações abaixo foi conferida por Claude Code direto no documento original (diferente do resto da base técnica desta plataforma, que foi conferida contra PDF oficial) -- os documentos não estavam disponíveis localmente. Tratar como material de apoio pra narrativa de laudo, nunca como faixa numérica homologável, até revisão de um agrônomo responsável.

FERTILIZANTE ORGANOMINERAL: as duas pesquisas concordam no ponto central -- a fração orgânica NÃO aumenta, por si só, a eficiência de aproveitamento de N/P/K nas doses normalmente recomendadas para cultivo anual; a escolha deve ser pelo custo da unidade de nutriente efetivamente garantida, nunca por um "fator de superioridade" genérico do organomineral. Fonte mais forte e mais recente (achada só pelo GPT, estudo feito no próprio RS): DE BONA, F.D.; SILVA JÚNIOR, J.P. Eficiência de uso de fertilizantes organominerais de matriz orgânica de linhito em solos do Rio Grande do Sul. Embrapa Trigo, Boletim de Pesquisa e Desenvolvimento 118, Passo Fundo, set/2024 -- comparou fonte mineral x organomineral de P e K em 4 solos (diferentes teores de argila) e em campo real em Passo Fundo, ao longo de 6 ciclos com soja/trigo/milho/aveia-branca: em ambiente controlado o organomineral NÃO foi mais eficiente que o mineral pra trigo/soja; em campo, teve valor agronômico similar (não superior) ao mineral, sustentando produtividade alta e aumentando P/K disponível no solo. Não há regra oficial (CQFS ou MISOSUL) de dose diferenciada pra organomineral sólido nem líquido -- "não encontrado" nos dois casos, então não aceitar "dose equivalente a X% do mineral" alegada por fabricante sem laudo próprio do produto.

FOSFATO NATURAL REATIVO (FNR): definição legal -- mínimo 28% P2O5 total, 30% solúvel em ácido cítrico 2%. Só tem desempenho comparável a fosfato solúvel em solo ÁCIDO (reage melhor com pH baixo -- aplicar cerca de 3 meses antes da calagem). Aplicar a lanço e incorporado, nunca no sulco (aplicação localizada reduz muito a eficiência). Menor eficiência no primeiro cultivo, equipara ou supera fonte solúvel só depois de 2-3 cultivos. Segundo a publicação regional de milho mais recente (MISOSUL 2025), fosfato natural farelado é indicado para ADUBAÇÃO CORRETIVA de P (elevar teor de solo deficiente) -- e é DESACONSELHADO como fonte de manutenção em cultura anual, exceto quando o solo já está na classe Médio ou Alto de P. Importante não confundir com corretivo de acidez: fosfato natural corrige teor de P, calcário corrige pH -- são operações diferentes, nunca tratar como substitutas. ALERTA PARA O RAIZ DIGITAL: em solo com uso de fosfato natural nos últimos 2 anos, o método Mehlich-1 pode SUPERESTIMAR o P disponível -- nesse caso usar Mehlich-3 (ou resina, na edição 2004) em vez de Mehlich-1. Sugestão de produto: campo "aplicou fosfato natural nos últimos 2 anos?" no cadastro do talhão, alertando a interpretação por Mehlich-1 quando marcado sim.

BIOINSUMOS -- classificar por nível de evidência (framework do GPT, adotado porque é mais seguro que um "comprovado/não comprovado" binário): Nível A (consolidado, recomendação oficial, grande volume de ensaio) -- fixação biológica de N por Bradyrhizobium na soja, tecnologia que já dispensa adubo nitrogenado na cultura quando a nodulação está adequada (Embrapa Soja, Circular Técnica 212, 2024). Nível B (validado pra cepa/produto específico, não generalizável pra categoria) -- Azospirillum brasilense estirpes Ab-V5/Ab-V6 (aumento médio de produtividade de milho 24-31%, trigo 13-18% em rede de ensaios, Embrapa Soja); BiomaPhos, Bacillus megaterium CNPMS B119 + Bacillus subtilis CNPMS B2084 (registro MAPA pra milho e soja, ganhos de produtividade de milho de 6-24% dependendo do local, Embrapa Milho e Sorgo). Nível C (promissor mas contextual, resposta depende de genótipo/ambiente) -- bactérias promotoras de crescimento em geral: estudo de 2025 da Embrapa Milho e Sorgo testou 42 híbridos de milho com bactérias promotoras e encontrou respostas POSITIVAS, NEGATIVAS e NEUTRAS dependendo da combinação genótipo×bactéria -- nunca aplicar um "bônus" genérico só porque o produtor diz que usou "bactéria promotora de crescimento". Nível D (alegação comercial sem validação independente) -- remineralizadores ("pó de rocha"): posição institucional explícita da Embrapa é que, apesar de registrados no MAPA, não há estudos sistemáticos conclusivos a campo pra recomendar com segurança técnica; "consórcio de microrganismos" sem cepa declarada, mesma categoria. REGRA PRO RAIZ: só considerar bioinsumo nível A ou B pra qualquer ajuste de dose/recomendação; nível C entra só como observação no laudo, nunca ajusta número; nível D não entra.

DISPONIBILIDADE DE NUTRIENTE POR pH: as duas pesquisas concordam no padrão geral -- N, P e K com disponibilidade máxima perto de pH 6,0-6,5; abaixo de pH 5,5 não há mais alumínio tóxico (precipita); em solo ácido o P é fixado por Fe/Al, em solo alcalino (pH>7,0) por Ca, com deficiência de micronutrientes catiônicos (Cu, Zn, Mn, Fe caem com pH alto; Mo e B sobem). MAS discordam da fonte exata do diagrama clássico: Claude citou Embrapa Algodão, Circular Técnica 145 (2025), citando Malavolta (1979); GPT citou Embrapa Gado de Leite, Comunicado Técnico 47 (2005, Carlos Eugênio Martins), citando Malavolta (1981) -- divergência não resolvida (ano 1979 x 1981 do mesmo autor-base, possivelmente edições diferentes de "ABC da Adubação"), registrada honestamente em vez de escolher uma arbitrariamente. AVISO IMPORTANTE (GPT): esse diagrama é CONCEITUAL, não uma curva quantitativa calibrada -- nunca usar a espessura/posição de uma linha pra calcular um percentual de disponibilidade (ex.: "P está 83% disponível em pH 6,5" seria inventado). Serve só pra camada explicativa/educacional do laudo; a classificação quantitativa real continua vindo sempre das tabelas CQFS e do método laboratorial específico. A CQFS-RS/SC 2016 tem uma versão própria, restrita a micronutrientes (Cu, Zn, Mn caem e B sobe com pH mais alto; maior chance de resposta em solo arenoso com MO baixa e pH muito baixo (B) ou muito alto, >7,0 (Cu, Zn, Mn)) -- essa sim, oficial da região, pode ser citada com mais confiança que o diagrama de 11 nutrientes de origem nacional.`,
};

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'MILHO'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile MILHO não encontrado.");

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, MILHO_N_PK_SOURCE.title]);
  const r1 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [MILHO_N_PK_SOURCE.title, MILHO_N_PK_SOURCE.institution, MILHO_N_PK_SOURCE.editionYear, cropProfileId, MILHO_N_PK_SOURCE.content],
  );
  console.log(`technical_source (N/P2O5/K2O milho) -> ${r1.rows[0].status} (${r1.rows[0].id})`);

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id IS NULL AND title = $1`, [BOAS_PRATICAS_MODERNAS_SOURCE.title]);
  const r2 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, NULL, $4) RETURNING id::text, status`,
    [BOAS_PRATICAS_MODERNAS_SOURCE.title, BOAS_PRATICAS_MODERNAS_SOURCE.institution, BOAS_PRATICAS_MODERNAS_SOURCE.editionYear, BOAS_PRATICAS_MODERNAS_SOURCE.content],
  );
  console.log(`technical_source (boas práticas modernas, geral) -> ${r2.rows[0].status} (${r2.rows[0].id})`);
}

main().finally(() => pool.end());
