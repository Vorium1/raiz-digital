import pg from "pg";

/**
 * Conteúdo novo pra TRIGO, verificado direto no PDF real de "Informações
 * Técnicas para Trigo e Triticale -- Safra 2026" (Embrapa Trigo, a partir
 * da 17ª Reunião da Comissão Brasileira de Pesquisa de Trigo e Triticale,
 * agosto/2025) -- baixado e lido com pdftotext em 2026-09-04.
 *
 * Contexto: o diretor pediu pra pesquisar como maximizar teor de proteína
 * no grão de trigo (uso em glúten vital) versus maximizar rendimento/amido
 * (uso em etanol). O Gemini respondeu esse tema citando esta publicação
 * real, mas errou detalhes ao extrair (disse que a tabela de N mudou pra
 * rendimentos >5-6t/ha -- falso, é idêntica à de 2016, já carregada;
 * inventou uma dose de "20-30 kg/ha" pra aplicação tardia que a fonte real
 * não especifica). Este arquivo carrega a versão CONFERIDA, não a do Gemini.
 */

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

const TITLE = "Informações Técnicas para Trigo e Triticale — Safra 2026 (Embrapa Trigo, 17ª Reunião da Comissão Brasileira de Pesquisa de Trigo e Triticale, ago/2025)";
const INSTITUTION = "Embrapa Trigo";

const CONTENT = `MANEJO DE NITROGÊNIO PARA PROTEÍNA VS. RENDIMENTO (trigo pão/melhorador para glúten vital vs. trigo para amido/etanol): a aplicação de nitrogênio entre os estádios de emborrachamento e florescimento ("aplicação tardia") geralmente NÃO aumenta o rendimento de grãos, mas pode aumentar o teor de proteína "em situações particulares de ambiente e de cultivar". Esse acréscimo de proteína não resulta necessariamente em alteração da força de glúten (W) a ponto de mudar a classificação comercial do trigo. É responsabilidade do obtentor (quem desenvolveu a cultivar) informar se aquela cultivar específica é responsiva a essa prática -- informação essencial porque a aplicação tardia aumenta o custo de produção, e o modelo de negócio do produtor precisa prever remuneração compatível (comprador pagando mais por proteína ou por força de glúten), senão a prática não compensa. IMPORTANTE PRO RAIZ DIGITAL: não existe uma dose fixa recomendada de N tardio pra elevar proteína -- a fonte oficial explicitamente não define um número, porque depende da cultivar. Qualquer recomendação de dose de N tardio precisa vir acompanhada da pergunta "essa cultivar é conhecida por responder a essa prática?", nunca aplicada como regra genérica.

EVIDÊNCIA EXPERIMENTAL BRASILEIRA (por que a posição oficial é cética): Embrapa Trigo, ensaios em Passo Fundo (safras 2012/2013, 8 e 5 genótipos + 1 testemunha indicada pelo obtentor como responsiva) -- variar dose/época de N tardio não aumentou rendimento significativamente, em algumas situações reduziu, e NÃO houve resposta positiva significativa de força de glúten em nenhuma cultivar/ano testado (Bristot et al., "Aplicação tardia de nitrogênio em trigo", UPF, 2014). UFRGS/Eldorado do Sul (safras 2010/2011, cultivares Quartzo e Mirante, +40kg N/ha em emborrachamento ou floração) -- rendimento só aumentou em 2011; força de glúten e proteína se correlacionam, mas de forma específica por cultivar/ano; parcelar a mesma dose em mais aplicações ajudou mais que aumentar a dose (dissertação UFRGS, Lume handle 10183/142633). Para o Paraná (Pauletti & Motta, 2019): N tardio no pré-espigamento não altera rendimento nem número de queda nem estabilidade farinográfica; pode aumentar força de glúten sem mudar o enquadramento comercial.

ESTUDO MAIS RECENTE E MAIS DECISIVO (achado pelo GPT, cross-validado): GUARIENTI, E.M. et al. Estratégias de adubação nitrogenada em trigo, efeitos na qualidade tecnológica. Embrapa Trigo, Boletim de Pesquisa e Desenvolvimento 120, Passo Fundo, 2025. Testou 12 ambientes (RS+PR), 3 cultivares contrastantes em força de glúten, MESMA dose total de N em cobertura (90kg/ha, nitrato de amônio) só REDISTRIBUÍDA entre estádios (6 estratégias: EMN1 a EMN5 combinando vegetativo/afilhamento/alongamento/espigamento em frações de 1/3, e EMN6 sem N). Resultado: estratégias com N tardio no espigamento só foram superiores em POUCOS ambientes, resposta variou muito por cultivar×ambiente, e no conjunto NENHUMA estratégia de parcelamento se mostrou consistente o bastante pra virar recomendação geral de aumento de proteína/glúten úmido/W. Conclusão dos próprios autores: precisa de mais pesquisa dada a forte interação genótipo×ambiente×manejo de N. ESTE É O ACHADO MAIS IMPORTANTE PRO RAIZ DIGITAL sobre este tema: mesmo redistribuindo (não aumentando) a dose de N pra fases tardias, não existe hoje receita validada de estádio/parcelamento que garanta mais proteína ou mais força de glúten de forma confiável -- reforça que a via real pra glúten vital é escolha de cultivar, não engenharia de dose de N.

CONCLUSÃO PRÁTICA: pra destino etanol/amido, o protocolo de máximo rendimento já documentado (15-20kg/ha semeadura + resto entre perfilhamento e alongamento) é o correto, sem mudança. Pra destino proteína/glúten vital, a alavanca comprovada é ESCOLHA DE CULTIVAR (classe Melhorador), não manejo de N tardio -- existem cultivares específicas pra etanol/"Outros Usos" (BS Etanol, BS Etanol 8, TBIO Energia I e II, entre outras) que são a via correta pra esse objetivo, não uma dose de fertilizante.

CLASSIFICAÇÃO COMERCIAL DO TRIGO (IN MAPA nº 38/2010, sem alteração normativa até esta edição): Melhorador precisa bater os 3 parâmetros -- W≥300 (10⁻⁴J), estabilidade≥14min, número de queda≥250s; Pão -- W≥220, estabilidade≥10min, NQ≥220s; Doméstico -- W≥160, estabilidade≥6min, NQ≥220s; Básico -- W≥100, estabilidade≥3min, NQ≥200s; Outros usos -- qualquer valor. Regra: pra Melhorador precisa dos 3; pras demais, força de glúten OU estabilidade, mais o número de queda. IMPORTANTE: a classe comercial indicativa de uma cultivar varia por região de adaptação (mesma cultivar pode ser Pão numa região e Melhorador ou Doméstico noutra) -- não é um valor fixo só da cultivar, depende de onde é plantada.

METAS DE QUALIDADE POR DESTINO INDUSTRIAL (esta é a fonte que realmente conecta proteína a uso, mais direta que a IN 38 pro caso de glúten vital): panificação artesanal -- W mín. 280, P/L 1,2-2,0, absorção de água mín. 58%, estabilidade mín. 15min, NQ mín. 250s, proteína mín. 12% (base seca); panificação industrial -- W mín. 250, estabilidade mín. 12min, proteína mín. 12%; massas frescas/instantâneas -- W mín. 180, NQ mín. 250s, proteína mín. 12%; biscoitos moldados doces -- W 90-160, proteína 8-9% (menor proteína é desejável aqui, ao contrário de pão/glúten).

REDUTOR DE CRESCIMENTO (evita acamamento em manejo de alta fertilidade/alto teto produtivo): uso restrito a cultivares com tendência ao acamamento, solos de fertilidade elevada, e trigo irrigado -- NÃO é prática obrigatória ou universal, e não deve ser usado se houver deficiência hídrica no início do desenvolvimento da cultura. Produto indicado: trinexapaque-etílico, na fase de elongação (1º nó visível), dose 0,4 L/ha -- conferir registro do produto no MAPA e cadastro estadual antes do uso. Algumas cultivares têm reação de toxicidade a essa dose; nesse caso, consultar assistente técnico e a indicação específica do obtentor da cultivar.

ENXOFRE NO TRIGO (dose explícita, confirma grupo geral): se a análise confirmar deficiência (S <5mg/dm³), aplicar cerca de 20 a 30 kg/ha de S -- solo arenoso com MO baixa tem maior chance de deficiência. Sobre gesso agrícola em trigo: a pesquisa no Sul do Brasil NÃO tem certeza de resposta do trigo/triticale ao produto como condicionador de subsuperfície -- não recomendar como prática padrão.

FERTILIZANTES FOLIARES EM TRIGO: posição negativa explícita da pesquisa -- resultados com vários tipos de foliar (macro e micronutrientes) indicam que, em geral, NÃO há vantagem econômica do uso em trigo/triticale no RS/SC.

MICRONUTRIENTES EM TRIGO: solos do RS/SC são, em geral, bem supridos em Zn, Cu, B, Mn, Cl, Fe e Mo -- deficiência é incomum em trigo/triticale, uso deve ser cauteloso (não aplicar por precaução sem indício real).

INOCULAÇÃO DE SEMENTES: indicado uso de inoculante com Azospirillum brasilense e/ou outras bactérias associativas promotoras de crescimento, devidamente registrado no MAPA -- eficiência agronômica pode variar conforme condição de cultivo.

PERIODICIDADE DE ANÁLISE: análise de solo de rotina (calagem e adubação) deve ter periodicidade máxima de 3 anos.

FERTILIZANTE ORGÂNICO EM TRIGO/TRITICALE: pode ser fonte de macro e micronutrientes; as doses de N, P2O5 e K2O seguem as mesmas tabelas usadas pra fertilizante mineral, mas a equivalência no primeiro cultivo é de aproximadamente 50% pra N, 80% pra P e 100% pra K.

CONFIRMAÇÃO IMPORTANTE: esta publicação de 2026 reproduz a tabela de nitrogênio (60/80, 40/60, ≤20/≤20 kg N/ha por MO×antecessora, ajuste +20/+30 kg/ha por tonelada acima de 3t/ha) e a de fósforo/potássio do trigo EXATAMENTE IGUAIS à edição CQFS 2016 já carregada nesta base -- nenhuma mudança nos números-base.

CORREÇÃO IMPORTANTE ACHADA NESTA VERIFICAÇÃO (calagem em plantio direto consolidado sem restrição): a Tabela 1 desta publicação de 2026 diz "1 SMP para pHágua 6,0" pra essa situação -- mas isso diverge do próprio Manual CQFS 2016 que ela cita como fonte. Conferi direto no Anexo 1 do manual original de 2016 (exemplo numérico completo, com contas batendo): a dose correta é "1/4 SMP para pHágua 6,0" (os valores do exemplo -- 3,7/4,2/6,8 t/ha no convencional viram exatamente 0,9/1,0/1,7 t/ha no plantio direto consolidado sem restrição, ou seja, exatamente 1/4). A publicação de 2026, nesse ponto específico, parece ter um erro de transcrição em relação à própria fonte que cita -- usar 1/4 SMP, não 1 SMP, quando o motor da plataforma ganhar suporte a cálculo de calagem por fórmula.`;

async function main() {
  const cropResult = await pool.query("SELECT id::text FROM crop_profiles WHERE code = 'TRIGO'");
  const cropProfileId = cropResult.rows[0]?.id;
  if (!cropProfileId) throw new Error("crop_profile TRIGO não encontrado.");

  await pool.query(`DELETE FROM technical_sources WHERE crop_profile_id = $1::uuid AND title = $2`, [cropProfileId, TITLE]);
  const r = await pool.query(
    `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, content)
     VALUES ($1, $2, $3, $4::uuid, $5) RETURNING id::text, status`,
    [TITLE, INSTITUTION, 2026, cropProfileId, CONTENT],
  );
  console.log(`technical_source (trigo, safra 2026 -- proteína/glúten, redutor de crescimento, org.) -> ${r.rows[0].status} (${r.rows[0].id})`);
}

main().finally(() => pool.end());
