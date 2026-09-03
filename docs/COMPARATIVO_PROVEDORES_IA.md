# Comparativo de provedores de IA — para decisão do diretor do projeto

> Nenhum provedor foi conectado. Nenhuma chave de API foi criada ou usada. Este documento existe para
> apoiar a escolha — a implementação já está pronta para receber qualquer um deles atrás do mesmo
> contrato (`AgronomicExplanationProvider` e `OperationalAssistantProvider`).

## O que já está pronto para receber um provedor real

Hoje as duas interfaces são implementadas por adaptadores locais, determinísticos, sem custo:
`localTemplateNarrativeProvider` (síntese agronômica) e `localIntentAssistantProvider` (Assistente RAIZ).
Conectar um provedor real é escrever **um novo arquivo** que implementa a mesma interface e trocar o
retorno de `resolveAgronomicExplanationProvider()`/`resolveOperationalAssistantProvider()` — nenhuma tela,
nenhuma rota de API, nenhum fluxo de revisão muda.

## Providers compatíveis com a interface

Qualquer provedor que aceite um prompt de texto/JSON e devolva texto serve, porque o contrato já exige
que a resposta seja validada contra o schema (`agronomic-narrative-schema.ts`) antes de chegar à tela —
isso funciona igual não importa o fornecedor.

| Provedor | Modelo sugerido | Custo aproximado (entrada/saída por 1M tokens, USD) | Português/conteúdo técnico | Janela de contexto | Observação |
|---|---|---:|---|---:|---|
| Anthropic | Claude (linha Sonnet) | ~US$ 3 / US$ 15 | Muito bom em português técnico e em seguir instruções estritas de formato (schema JSON) | 200k tokens | Historicamente forte em obedecer regras rígidas tipo "nunca invente" — relevante aqui |
| OpenAI | GPT (linha "mini"/intermediária) | ~US$ 0,15–0,60 / US$ 0,60–2,40 (modelos "mini") a ~US$ 2,50 / US$ 10 (modelo principal) | Bom em português, ecossistema mais maduro de ferramentas | 128k–200k tokens conforme o modelo | Opção mais barata na faixa "mini", útil para o Assistente RAIZ (perguntas simples) |
| Google | Gemini (linha Flash) | ~US$ 0,075–0,15 / US$ 0,30–0,60 (Flash) | Bom em português, muito competitivo em custo | 1M+ tokens em alguns modelos | Contexto muito grande é útil se o pacote de evidências crescer bastante (históricos longos) |

*(Preços de mercado mudam com frequência — os valores acima são uma referência de ordem de grandeza, não
uma cotação. Antes de contratar, confirmar o preço vigente na página oficial do provedor escolhido.)*

## Facilidade de trocar de modelo

Alta nos três — todos expõem uma API HTTP simples de texto/chat. A arquitetura já isola essa troca:
nenhuma tela ou rota depende de qual provedor está por trás; só o arquivo do adaptador muda.

## Impacto na arquitetura

Nenhum. O pacote de evidências, o schema de resposta, a auditoria (`ai_generations`) e o fluxo de revisão
profissional já são genéricos — foram desenhados sem nenhum campo específico de provedor.

## Opção recomendada para desenvolvimento

**Um modelo "mini"/"flash" de qualquer um dos três** (GPT mini, Gemini Flash ou um Claude menor) — custo
baixíssimo por teste, suficiente para validar o fluxo completo (evidência → síntese → revisão) antes de
gastar com o modelo principal.

## Opção recomendada para produção

**Anthropic Claude (linha Sonnet)** é a recomendação técnica principal para a **síntese agronômica**
especificamente, por dois motivos concretos deste produto:
1. o requisito mais crítico aqui não é criatividade, é **obediência estrita a regras** ("nunca invente
   valor", "nunca escolha faixa", "sempre devolva o schema exato") — é exatamente o tipo de instrução em
   que modelos da Anthropic tendem a ser mais consistentes;
2. o pacote de evidências pode ficar grande com histórico — 200k tokens de contexto é confortável.

Para o **Assistente RAIZ (IA operacional)**, que hoje já funciona sem nenhum LLM (respostas determinísticas
via consulta real ao banco), a recomendação é **adiar a troca por um LLM real** até haver uma necessidade
concreta de perguntas verdadeiramente livres (fora do repertório reconhecido) — e, quando chegar essa hora,
usar a opção mais barata (GPT mini ou Gemini Flash), porque ali o risco é baixo (nunca decide agronomia,
só organiza dado operacional).

## O que muda quando o diretor autorizar

1. Criar a conta e a chave de API do provedor escolhido — a chave fica **só** em variável de ambiente do
   servidor (Vercel), nunca no repositório, nunca no navegador.
2. Escrever um arquivo `src/lib/ai/providers/<provedor>-narrative-provider.ts` implementando
   `AgronomicExplanationProvider`.
3. Trocar o retorno de `resolveAgronomicExplanationProvider()` para esse novo provedor.
4. Nada mais muda — telas, auditoria, fluxo de revisão e o motor determinístico continuam exatamente
   iguais.
