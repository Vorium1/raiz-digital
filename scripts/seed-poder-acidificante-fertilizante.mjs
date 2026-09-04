import pg from "pg";

/**
 * Poder acidificante de fertilizante x disponibilidade de nutriente por pH.
 * Tema geral (crop_profile_id NULL), pedido pelo diretor (que também
 * fabrica fertilizante) pra avaliar de forma justa qualquer produto,
 * incluindo o dele -- nunca pra "provar" um produto específico.
 *
 * Fonte principal: BORGES, A.L.; SILVA, D.J. Fertilizantes para
 * fertirrigação. Cap. 7. In: Irrigação e fertirrigação em fruteiras e
 * hortaliças. Embrapa -- única fonte brasileira citável achada (por Claude,
 * 2026-09-04) com definição metodológica explícita do índice. Cross-check:
 * o Gemini respondeu o mesmo tema com números de eficiência (30%/81%) que o
 * Claude não conseguiu sustentar com nenhum estudo brasileiro publicado --
 * tratados como não confiáveis, não carregados (ver nota no fim).
 * Claude Code confirmou que o Manual CQFS-RS/SC 2016 (capítulo 8.2.1,
 * conferido diretamente) NÃO tem tabela de poder acidificante -- por isso
 * esta é a melhor fonte disponível pra este tema, mesmo não sendo CQFS.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const TITLE = "Poder acidificante do fertilizante × disponibilidade de nutriente por pH — pesquisa cruzada (Claude + GPT + Gemini, confiança variável por item)";
const INSTITUTION = "Compilação cruzada, fonte principal: Borges & Silva, Embrapa (Fertilizantes para fertirrigação)";

const CONTENT = `ÍNDICE DE ACIDEZ/BASICIDADE (kg de CaCO3 necessários para neutralizar 100 kg do produto) -- CRUZADO entre duas fontes acadêmicas brasileiras independentes: (1) BORGES, A.L.; SILVA, D.J. Fertilizantes para fertirrigação, Cap. 7, in Irrigação e fertirrigação em fruteiras e hortaliças, Embrapa; (2) BATISTA, M.A. et al. Princípios de fertilidade do solo, adubação e nutrição mineral, in Hortaliças-fruto, EDUEM/UEM, 2018 (Tabela 18, adaptada de Tisdale, Nelson & Beaton -- referência clássica internacional). As duas fontes concordam em: Sulfato de amônio 110, Nitrato de amônio 60, Ureia ~71-84 (mesma ordem de grandeza), Nitrato de cálcio/potássio/magnésio/sódio com reação BÁSICA, KCl e sulfato de potássio NEUTROS (derruba o mito comum de que KCl acidifica solo -- a acidificação associada a lavoura potássica vem do N que acompanha a formulação, não do KCl). DIVERGÊNCIA ENCONTRADA E NÃO RESOLVIDA: fonte (1) diz DAP=88/MAP=60; fonte (2) diz MAP=88/DAP=60 -- valores invertidos entre as duas. Raciocínio de consistência química (não é confirmação de fonte primária, é inferência): DAP tem mais N por kg de produto (~18%) que MAP (~11%) e a acidificação vem majoritariamente do N amoniacal via nitrificação -- por esse raciocínio, DAP deveria acidificar mais que MAP por 100kg de produto, o que favorece a versão da fonte (1) (DAP=88 > MAP=60). Mas isso é inferência, não fonte primária conferida -- tratar os dois valores (DAP e MAP) como incertos até verificação direta.

CUIDADO NA LEITURA DO ÍNDICE (importante pro RAIZ Digital, é onde material comercial costuma errar): o índice acima é por 100kg de PRODUTO, não por unidade de nutriente. Ureia (71) parece menos acidificante que sulfato de amônio (110), mas ureia tem 45% de N e sulfato só 20% -- por kg de N efetivamente entregue, a diferença muda bastante. Se for calcular "acidez por kg de N", derive isso a partir desta tabela e da garantia do rótulo, e marque explicitamente como valor CALCULADO/DERIVADO, nunca como se fosse valor direto da fonte.

QUÍMICA POR TRÁS (vale pra qualquer fertilizante, inclusive formulações não listadas): fonte de N nítrica (NO3-) tem efeito alcalino -- a planta libera OH-/HCO3- na rizosfera pra manter equilíbrio ao absorver o nitrato. Fonte de N amoniacal (NH4+, inclusive ureia após hidrólise) tem efeito ácido -- a nitrificação (2NH4+ + 3O2 -> 2NO2- + 2H2O + 4H+) libera H+ no solo. Isso é mecanismo geral, aplicável a qualquer produto amoniacal, independente de marca.

FERTILIZANTES DE REAÇÃO NEUTRA OU BÁSICA -- existem de verdade, duas rotas reais: (a) N nítrico associado a cátion básico -- nitrato de cálcio, de potássio, de magnésio, de sódio; (b) fonte fosfatada alcalina -- termofosfato magnesiano e escórias de siderurgia (silicatos de Ca/Mg), que reagem como base (mecanismo: SiO3²⁻, base fraca mas mais forte que o CO3²⁻ do calcário -- fonte: Embrapa Algodão, Circular Técnica 145, 2025).

O QUE NÃO ESTÁ COMPROVADO POR ESTUDO BRASILEIRO PUBLICADO (importante ser honesto sobre isso): não existe, na literatura brasileira localizada, um estudo em safras sucessivas comparando fertilizante de reação básica com garantia NPK menor contra fertilizante ácido com garantia maior, medindo desfecho de disponibilidade de nutriente e produtividade ao longo do tempo. Essa comparação específica é exatamente o argumento comercial de produtos de nicho (inclusive o do diretor), e ela NÃO está sustentada por ensaio publicado encontrado até agora -- tratar com honestidade: a química do mecanismo é sólida e real, mas o "quanto isso realmente vale em produtividade ao longo de safras" ainda não tem número publicado no Brasil.

O que EXISTE e é citável, mais modesto que a alegação comercial completa: estudo de pomar (8 anos, Revista Brasileira de Ciência do Solo) -- ureia foi o que mais acidificou entre N/P/K testados, com efeito mensurável na nutrição foliar (mas é pomar, dose localizada, não isola "disponibilidade ao longo do tempo" como variável). Estudo Embrapa em milho (Argissolo) comparando sulfato e nitrato de amônio -- ambos igualmente eficientes no fornecimento de N, e NENHUM dos dois causou acidificação mensurável do solo após UMA safra -- ou seja, em curto prazo (1 safra), a diferença de índice de acidez não virou diferença de pH detectável. Onde o efeito É rápido e documentado: fertirrigação localizada (gotejamento) -- fonte ácida concentrada numa zona restrita de solo molhado pode reduzir pH já num único ciclo -- esse é o único cenário com impacto agronômico de curto prazo comprovado.

NÃO CARREGAR NA BASE, REJEITADO NA VERIFICAÇÃO: o Gemini, respondendo este mesmo tema, afirmou que "em solo com pH 4,5 a eficiência de aproveitamento de NPK cai pra ~30%, e sobe pra 81% em pH 6,0", citando a ABRACAL (associação de produtores de calcário). Nem Claude nem GPT (pesquisas independentes, mesma rodada) conseguiram sustentar esse número com nenhum estudo brasileiro publicado, e a fonte citada (ABRACAL) tem interesse comercial direto em promover calagem -- portanto esse número tem cara de estatística de material de divulgação setorial, não de estudo controlado. NÃO usar esses percentuais (30%/81%) em nenhum lugar da plataforma.

QUANTIFICAÇÃO REAL DA ACIDIFICAÇÃO POR N -- achado pelo GPT, dois estudos de campo brasileiros com número de verdade (isso é mais forte que só dizer "ureia acidifica"): CAIRES, E.F.; MILLA, R. Adubação nitrogenada em cobertura para o cultivo de milho com alto potencial produtivo em sistema de plantio direto de longa duração. Bragantia, 2016 -- Latossolo argiloso, SPD de longa duração, Paraná: pra CADA 100kg de N/ha aplicado como ureia, mediu-se na camada 0-20cm aproximadamente -0,07 unidade de pH (CaCl2), -4,4 mmolc/dm³ de Ca+Mg, -2,8 pontos percentuais de saturação por bases; os autores estimaram que seriam necessários ~440kg/ha de CaCO3 (PRNT 100%) pra neutralizar a acidificação de cada 100kg N/ha aplicado naquele sistema. IMPORTANTE: apesar da acidificação, a produtividade de milho aumentou fortemente com a dose de N (máxima eficiência técnica/econômica perto de 19,6 t/ha) -- ou seja, acidificar não significa que o fertilizante deixou de compensar NAQUELA safra; significa que existe um passivo de longo prazo que precisa ser reposto por calagem. CAIRES et al. Surface liming and nitrogen fertilization for crop grain production under no-till management in Brazil. European Journal of Agronomy, 2015 -- acompanhamento 2004-2012, confirma que N amoniacal repetido acidifica e aumenta a resposta à calagem superficial, e que a calagem corrige a acidificação em profundidade relevante -- ou seja, fertilizante acidificante + correção adequada da acidez NÃO é sistema inferior, o erro é ignorar a reposição.

CASO DOCUMENTADO DE PERDA DE PRODUTIVIDADE (real, mas não generalizável como coeficiente): YAGI, R. Revolvimento ocasional do solo, calagem e adubação nitrogenada sobre sistema plantio direto de longa duração. Pesquisa Agropecuária Brasileira, 2018 -- trigo e milho em Latossolo muito argiloso, SPD longa duração, doses crescentes de ureia. Numa das condições testadas, dose alta de N foi associada a redução linear de rendimento de TRIGO de até ~14,5% (~400kg/ha) na maior dose, junto com acidificação e queda de Mg -- os autores apontam a acidificação como possível causa, mas essa resposta não se repetiu em todas as condições/tratamentos do experimento, então não vira coeficiente universal, só um caso real documentado de que a acidificação PODE custar produtividade em certas condições (solo muito argiloso, SPD de longa duração, sem reposição de calcário).

CONEXÃO COM A TABELA pH×DISPONIBILIDADE (já documentada nesta base): a conexão científica existe e é real -- acidificação reduz saturação por bases, pode aumentar toxidez de Al, reduz Ca/Mg trocável, muda disponibilidade de P e de micronutrientes -- mas o gráfico é conceitual, não permite calcular "MAP perde X% de eficiência quando o pH cai de 6,0 pra 5,2". A relação real, mostrada pelos estudos de Caires e Yagi, passa por uma cadeia: fonte de N -> acidificação acumulada -> capacidade tampão do solo -> calagem (ou falta dela) -> mudança em Al/Ca/Mg/V% -> resposta da cultura. Não existe atalho matemático direto do índice de acidez pro percentual de perda.

O QUE FICA "NÃO ENCONTRADO", REGISTRADO HONESTAMENTE: índice de acidez de superfosfato simples/triplo em uma das duas fontes cruzadas diz "0" (neutro) -- mas isso não foi confirmado numa terceira fonte independente, tratar com cautela moderada, não como certeza; índice de acidez pra formulações NPK compostas específicas (5-25-25, 20-05-20 etc.) -- não existe valor tabelado porque depende das matérias-primas do lote/fabricante (uma 20-05-20 feita com ureia acidifica diferente de uma feita com nitrato de amônio, e uma fórmula não informa a composição de origem, só as garantias finais de N-P2O5-K2O); os valores estequiométricos que circulam atribuídos a "Pavan e Oliveira, 1997" (ureia 3,6 kg CaCO3/kg N etc.) não tiveram a publicação original localizada por nenhuma das duas pesquisas -- não usar sem checar a fonte primária; um COEFICIENTE UNIVERSAL do tipo "cada unidade de índice de acidez custa X% de produtividade" -- não existe, mesmo com os estudos reais acima (eles quantificam casos e sistemas específicos, não uma fórmula geral).

RECOMENDAÇÃO PRA IMPLEMENTAÇÃO NO RAIZ DIGITAL: não inventar um "fator de perda de eficiência por acidez do fertilizante" -- isso seria inventar número sem fonte. Em vez disso, um balanço de acidez do sistema é defensável: somar a acidez gerada pelo programa de adubação (índice de acidez × quantidade de produto, quando o fabricante declara a composição) e comparar com o efeito residual esperado da calagem, gerando um alerta de reposição antecipada -- combinado com a regra já confirmada de reanálise de solo a cada 3 anos no máximo (fonte: Trigo Safra 2026), que já captura a acidificação na prática, sem precisar de coeficiente inventado.`;

async function main() {
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id IS NULL AND title = $1`, [TITLE]);
  const r = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, NULL, $4) RETURNING id::text, status`,
    [TITLE, INSTITUTION, null, CONTENT],
  );
  console.log(`technical_source (poder acidificante, geral) -> ${r.rows[0].status} (${r.rows[0].id})`);
}

main().finally(() => pool.end());
