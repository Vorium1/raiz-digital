/**
 * Transcrição (OCR + leitura) de um laudo de análise (PDF ou foto) via
 * Gemini -- ideia vinda da análise do concorrente `gestordefertilidade.com.br`
 * (2026-09-06), que já oferece leitura de laudo por IA. Reaproveita a MESMA
 * infraestrutura de provedor já usada em `gemini-prescription-provider.ts`
 * (mesma chave `GEMINI_API_KEY`, mesmo padrão de chamada REST) -- decisão
 * por ser a alternativa mais simples/barata/já paga, não um novo vendor.
 *
 * REGRA ABSOLUTA, mesma do resto da base: a IA aqui só TRANSCREVE números já
 * impressos no documento -- nunca classifica, nunca calcula, nunca decide
 * agronomia. A saída (CSV) é alimentada no MESMO validador determinístico
 * que já processa upload manual de CSV/XLSX (`buildLabImportPreview` em
 * `src/domain/lab-import.ts`), então todo o resto do pipeline (normalização
 * de parâmetro, detecção de bloqueio, confiança) continua sendo o código já
 * testado -- a IA não pula essa validação, só substitui a digitação manual.
 * A revisão humana obrigatória (já existente na tela de importação) continua
 * valendo, e a UI marca claramente quando o resultado veio de transcrição
 * por IA, não de upload direto do usuário.
 */

export type LabExtractionInput = { fileBase64: string; mimeType: string };
export type LabExtractionResult = { csvContent: string; provider: "google"; model: string };

const PROMPT = [
  "Você está transcrevendo, número por número, um laudo real de análise de solo ou foliar. Pode ter várias amostras, pontos ou profundidades no mesmo documento.",
  "NÃO interprete, NÃO classifique (ex.: não diga se é \"baixo\" ou \"adequado\"), NÃO calcule nada -- apenas transcreva cada resultado exatamente como está impresso.",
  "Responda SOMENTE com uma tabela CSV, separador ponto e vírgula (;), sem nenhum texto antes ou depois, sem bloco de código markdown, com EXATAMENTE estas 5 colunas na primeira linha: amostra;parametro;valor;unidade;metodo",
  "Regras:",
  "- Uma linha de dado por resultado. Se o laudo tem várias profundidades ou pontos, cada um é uma \"amostra\" diferente -- use o identificador exato impresso (ex.: \"0-20cm\", \"Ponto 1\", \"P1-0-20\"). Se não houver identificador nenhum, use \"AMOSTRA-1\" para todas as linhas.",
  "- Coluna \"parametro\": o nome ou sigla exatamente como impresso no laudo (ex.: \"pH\", \"Fósforo\", \"P\", \"Potássio\", \"Ca\", \"V%\", \"MO\"). Não troque por outro código nem traduza.",
  "- Coluna \"valor\": só o número. Nunca escreva a unidade junto.",
  "- Coluna \"unidade\": exatamente como impressa (ex.: \"mg/dm³\", \"cmolc/dm³\", \"%\"). Se não tiver certeza, deixe vazio -- nunca invente.",
  "- Coluna \"metodo\": o método/extrator, se estiver impresso (ex.: \"Mehlich-1\", \"Resina\"). Se não estiver impresso, deixe vazio.",
  "- Se um número estiver ilegível ou você não tiver certeza do valor, NÃO inclua essa linha -- é preferível omitir um resultado a transcrever um valor errado.",
  "- Nunca invente amostra, parâmetro ou valor que não esteja realmente impresso no documento.",
].join("\n");

function extractText(payload: unknown): string | null {
  const record = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const RETRYABLE_STATUS = new Set([503, 429]);
/** Espera curta entre tentativas -- 503 "alta demanda" do Gemini é explicitamente descrito como pico
 * temporário pelo próprio Google; observado nesta base (2026-09-08) em duas tentativas manuais separadas
 * por minutos, então uma única tentativa sem retry tem chance real de falhar por instabilidade externa,
 * não por erro nosso. Backoff curto porque isso roda dentro de uma requisição HTTP síncrona (usuário
 * esperando na tela de importação), não vale a pena esperar minutos. */
const RETRY_DELAYS_MS = [2000, 5000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const geminiLabExtractionProvider = {
  name: "google" as const,
  model: process.env.GEMINI_LAB_EXTRACTION_MODEL ?? "gemini-3.6-flash",

  async extract(input: LabExtractionInput): Promise<LabExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada -- leitura por IA indisponível nesta instância. Use upload manual de CSV/XLSX.");
    const model = this.model;

    let response: Response | undefined;
    let lastErrorBody = "";
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ inline_data: { mime_type: input.mimeType, data: input.fileBase64 } }, { text: PROMPT }],
              },
            ],
            generationConfig: { maxOutputTokens: 8000, temperature: 0 },
          }),
        },
      );
      if (response.ok) break;
      lastErrorBody = await response.text().catch(() => "");
      const shouldRetry = RETRYABLE_STATUS.has(response.status) && attempt < RETRY_DELAYS_MS.length;
      if (!shouldRetry) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    if (!response!.ok) {
      throw new Error(`Gemini API respondeu ${response!.status} (após ${RETRY_DELAYS_MS.length + 1} tentativa(s)): ${lastErrorBody.slice(0, 500)}`);
    }

    const payload = await response!.json();
    const csvContent = extractText(payload);
    if (!csvContent) throw new Error("A IA não retornou nenhum texto legível a partir deste arquivo -- tente uma foto mais nítida ou o upload manual de CSV/XLSX.");

    return { csvContent, provider: "google", model };
  },
};
