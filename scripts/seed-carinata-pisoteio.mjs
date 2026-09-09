import pg from "pg";

/**
 * Carinata (contexto/status, SEM faixa de suficiência -- ver justificativa
 * abaixo) e pisoteio animal (diagnóstico físico de compactação em ILP,
 * anexado a PASTAGEM_INVERNO). Cross-validado por Claude + GPT em
 * 2026-09-04, ambos concordando fortemente entre si -- inclusive
 * derrubando uma afirmação do Gemini (que tinha dito que já existe ZARC
 * pra carinata; os dois independentemente não acharam nenhuma portaria,
 * só o cadastro da espécie no MAPA, que é diferente de zoneamento aprovado).
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const CARINATA_CONTENT = `STATUS REAL (2026-09-04, cross-validado por Claude e GPT, forte concordância entre os dois): NÃO EXISTE, no Brasil, faixa de suficiência de solo (pH/P/K/Ca/Mg/S/micronutrientes), tabela de dose de N/P/K, nem ZARC (zoneamento de risco climático) próprios para carinata. É cultura muito recente no Brasil (primeiros ensaios Nuseed com Embrapa Agroenergia a partir de dez/2021 em MG/GO/DF; primeira safra comercial de maior escala no RS em 2024, expandindo em 2025 e 2026; início de projeto piloto em SC só em 2026). A CQFS-RS/SC 2016 obviamente não a cobre. Carinata está cadastrada como espécie no sistema do MAPA ("mostarda da Etiópia"), mas isso NÃO é a mesma coisa que ter ZARC aprovado -- sem ZARC, a cultura fica fora do Proagro e do seguro rural subvencionado, o que hoje é resolvido via contrato direto com a indústria (produção 100% comprada no plantio), não por política agrícola pública.

USAR CANOLA COMO REFERÊNCIA PROVISÓRIA -- SÓ COM AVISO EXPLÍCITO: não existe publicação brasileira dizendo "use a interpretação de canola pra carinata". A analogia (mesma família botânica, brássica, oleaginosa de inverno) tem precedente em fonte internacional (UF/IFAS Extension, EUA, orienta basear a adubação de carinata na de canola, com faixa de pH 5,5-6,5 lá -- não aplicável direto a RS/SC, solo/clima diferentes) mas NÃO é recomendação brasileira validada. SE o RAIZ Digital usar a faixa de canola como fallback provisório pra carinata, tem que aparecer no laudo, de forma explícita e visível: "referência provisória por analogia com canola -- não calibrada especificamente para carinata no RS/SC". Nunca apresentar como se fosse faixa oficial da cultura. IMPORTANTE: a equivalência carinata=canola não é nem garantida entre as próprias cultivares de carinata -- um ensaio da Embrapa Agroenergia registrou baixíssima produtividade (302kg/ha) da cultivar NuCover STH 100 no Centro-Oeste, atribuída a não-adaptação às condições edafoclimáticas locais -- ou seja, mesmo dentro da carinata, adaptação regional pode variar bastante.

EVIDÊNCIA (não recomendação) sobre demanda de nitrogênio: estudo do Uruguai (Bonansea, Ernst & Mazzilli, "Baseline for Brassica carinata Components of Nitrogen-Use Efficiency in Southern South America", Agronomy, 2023, ensaios 2016-2018 no sul da América do Sul) -- produtividades máximas (~2,5-3,5 t/ha) associadas a ~150-160kg N/ha de disponibilidade TOTAL (solo + fertilizante), com ~90-100kg N/ha de fertilizante no ponto de máxima produtividade. Isso é evidência experimental regional (sul da América do Sul, não Brasil especificamente), não uma dose recomendada -- há grande variação entre ambientes no próprio estudo. Sugere que o algoritmo ideal, quando houver dado suficiente, precisará considerar N do solo + cultura antecedente + expectativa de produtividade, não uma dose fixa.

PANORAMA COMERCIAL (contexto, não dado técnico): líder do programa genético/comercial é Nuseed/Nufarm (grupo australiano), com modelo de produção 100% contratada pela indústria; no RS, fomento inicial via parceria Celena Alimentos + Nuseed (lançada jan/2024); em SC, projeto piloto da Cooperalfa começou em 2026 (Planalto Norte Catarinense e outras regiões). Existe parceria internacional Nuseed+bp (10 anos) pra biocombustível/SAF a partir do óleo de carinata. NÃO CONFIRMADO: papel da Be8/BSBIOS num programa de fomento agrícola de carinata (apareceu como patrocinadora de eventos técnicos de trigo, mas nenhuma fonte independente liga a empresa diretamente ao fomento de carinata). Área plantada: fontes de imprensa setorial divergem bastante entre si (ex.: RS 2025 varia de ~10 mil a ~50 mil hectares dependendo da fonte) -- não existe estatística oficial (Conab/IBGE) pra essa cultura ainda; tratar qualquer número de área como estimativa de mercado, não fato verificado.

RECOMENDAÇÃO PRA IMPLEMENTAÇÃO: manter o crop_profile de CARINATA SEM faixas de suficiência carregadas (nenhuma foi carregada nesta base, de propósito) até que exista calibração brasileira real ou uma decisão explícita e documentada de usar canola como fallback com aviso visível no laudo. Isso é o oposto de "maquiar status" -- uma análise de carinata hoje deve retornar claramente "sem perfil homologado", nunca um número emprestado silenciosamente.`;

const PISOTEIO_CONTENT = `DIAGNÓSTICO DE COMPACTAÇÃO POR PISOTEIO ANIMAL EM SISTEMA DE INTEGRAÇÃO LAVOURA-PECUÁRIA (ILP) -- cross-validado por Claude e GPT em 2026-09-04, forte concordância entre os dois.

PRINCÍPIO CENTRAL: a pesquisa brasileira de referência (série UFRGS, Fazenda do Espinilho, Tupanciretã-RS, e Embrapa "Perguntas e respostas ILPF Região Sul", 2015) maneja o sistema por ALTURA DA PASTAGEM, não por lotação fixa (UA/ha) -- a lotação é a variável de AJUSTE, não o alvo. Não existe, na literatura brasileira, um teto de UA/ha definido como "seguro" -- codificar um número fixo de UA/ha como limite seria inventar dado.

METAS DE ALTURA COM RESPALDO REAL (aveia-preta + azevém, a mistura típica de pastagem de inverno no RS/SC): pastejo contínuo -- manter o pasto entre 20 e 30cm durante o ciclo (Embrapa, 2015); pastejo rotacionado/intermitente -- entrada com 20-30cm, saída/resíduo quando atingir 7-10cm (Embrapa, 2015; outras fontes citam saída até 10-15cm, mesma ordem de grandeza). Capacidade de suporte média nas condições consideradas: 1,0 a 2,0 UA/ha, ocupação de 1-3 dias por piquete em sistema rotacionado, deixando >3,0 t MS/ha de resíduo ao final. IMPORTANTE: esses números de UA/ha são recomendação de MANEJO DA PASTAGEM (produtividade/qualidade de forragem), não um "limite físico universal pra não compactar" -- não usar como regra tipo "se UA/ha > 2 então solo compactado", isso é incorreto.

ACHADO MAIS IMPORTANTE PRO RAIZ DIGITAL: pisoteio bem manejado NÃO necessariamente reduz a produtividade da cultura de verão seguinte. Confirmado por múltiplos estudos brasileiros: Terra Lopes et al. (Ciência Rural, 2009, série Espinilho-RS, 4 alturas de manejo 10/20/30/40cm) -- presença dos animais não prejudicou a soja seguinte. Rauber et al. ("O pastejo de vacas leiteiras compacta a superfície do solo sem reduzir a subsequente produtividade de cultura", Pesquisa Agropecuária Gaúcha, UFSM/UFFS, 2024, Latossolo Vermelho-RS) -- pastejo rotacionado de vacas leiteiras no inverno aumentou a densidade em 24% na camada 0-5cm, mas NÃO reduziu produtividade de soja/milho subsequente; escarificar reduziu a densidade em 19% mas TAMBÉM não aumentou a produtividade. CONCLUSÃO PRA IMPLEMENTAÇÃO: "compactação mensurável" e "perda de produtividade" são achados DIFERENTES -- o RAIZ Digital deve tratar diagnóstico físico (Ds/RP/macroporosidade) e impacto agronômico esperado como campos separados, nunca assumir que um implica o outro automaticamente.

PASTEJO CONTÍNUO × ROTACIONADO: a ciência NÃO sustenta a ideia simples de que um método é sempre menos arriscado que o outro -- o nome do sistema, isolado, não define o risco. O que importa mais é a combinação de: pressão instantânea de animais + tempo de permanência + cobertura/resíduo + umidade do solo no momento. Um estudo brasileiro (Leão et al., RBCS, 2004, com Embrapa Gado de Corte/ESALQ) encontrou rotacionado mais restritivo fisicamente que contínuo, mas atribuiu isso à maior lotação usada no tratamento rotacionado daquele experimento especificamente -- não uma regra geral do método. Recomendações práticas com respaldo: não encurtar demais o intervalo de retorno ao piquete (Lanzanova et al. 2007 mostrou que isso piora a infiltração de água); manter cobertura/resíduo vegetal (reduz o dano); amostrar trilha e entre-trilha SEPARADAMENTE (Marchão et al. 2009 -- as trilhas de trânsito dos animais concentram resistência à penetração muito mais alta que o resto do piquete; uma média das duas não representa nenhuma das duas situações reais).

UMIDADE DO SOLO: mecanismo bem estabelecido (solo muito úmido = plástico = mais suscetível à deformação pelo casco), mas NÃO existe um limite percentual único e universal publicado pra RS/SC ("não pastejar acima de X% de umidade") -- não codificar um número fixo desse tipo. O conceito correto é a faixa de friabilidade / limite de plasticidade do solo específico (depende de textura, MO, estrutura), determinável em laboratório, ou o conceito de intervalo hídrico ótimo (que já tem aplicação em pastejo na literatura brasileira). Se a plataforma for sinalizar risco por umidade, usar esse conceito qualitativo, não um percentual fixo.

INDICADORES DE DIAGNÓSTICO -- pisoteio tem assinatura DIFERENTE de compactação por máquina: pressão do casco é concentrada e SUPERFICIAL (efeito principal em 0-5cm, às vezes até 10-15cm dependendo do indicador), enquanto rodado de trator/colhedora se propaga mais fundo (10-30cm). Ranking de sensibilidade (mais sensível primeiro, confirmado em estudo de ILP no Planalto Médio-RS): resistência à penetração e macroporosidade são MAIS sensíveis que densidade do solo isolada pra detectar o efeito do pisoteio -- densidade sozinha tende a subdiagnosticar. Valores de referência REGIONAIS reais (Collares et al., "Compactação superficial de Latossolos sob integração lavoura-pecuária de leite no noroeste do Rio Grande do Sul", Ciência Rural, UFSM/UFPel, 2011): nos Latossolos argilosos avaliados, o conjunto Ds>1,4 Mg/m³ + macroporosidade<0,10 m³/m³ + resistência à penetração>2MPa (medida sob umidade de ~0,26 kg/kg) foi interpretado como degradação física. Debiasi & Franchini (2012) mediram resistência à penetração subindo de 1,72 pra 3,48 MPa na camada 0-5cm sob pastejo intensivo -- magnitude real documentada. AVISO IMPORTANTE: esses valores dependem de classe textural e da umidade no momento da medição -- não devem virar um limiar universal tipo "RP > 2MPa = compactado" sem registrar junto a classe textural do solo, a profundidade de amostragem e a umidade no momento da medição. Se o RAIZ Digital for usar esses limiares, armazenar sempre acompanhados desses três metadados.`;

async function main() {
  const carinataResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'CARINATA'");
  const carinataId = carinataResult.rows[0]?.id;
  if (!carinataId) throw new Error("crop_profile CARINATA não encontrado -- rode o seed anterior antes.");
  const carinataTitle = "Status real da carinata no Brasil (2026) — sem faixa de suficiência própria, cross-validado Claude+GPT";
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [carinataId, carinataTitle]);
  const r1 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [carinataTitle, "Compilação cruzada Claude+GPT, 2026-09-04", 2026, carinataId, CARINATA_CONTENT],
  );
  console.log(`technical_source (carinata, status) -> ${r1.rows[0].status} (${r1.rows[0].id})`);

  const pastagemResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'PASTAGEM_INVERNO'");
  const pastagemId = pastagemResult.rows[0]?.id;
  if (!pastagemId) throw new Error("crop_profile PASTAGEM_INVERNO não encontrado -- rode o seed anterior antes.");
  const pisoteioTitle = "Diagnóstico de compactação por pisoteio animal em ILP — cross-validado Claude+GPT";
  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [pastagemId, pisoteioTitle]);
  const r2 = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [pisoteioTitle, "Compilação cruzada Claude+GPT, 2026-09-04 (Embrapa, UFRGS, UFSM/UFFS, UFPel)", 2026, pastagemId, PISOTEIO_CONTENT],
  );
  console.log(`technical_source (pisoteio) -> ${r2.rows[0].status} (${r2.rows[0].id})`);
}

main().finally(() => pool.end());
