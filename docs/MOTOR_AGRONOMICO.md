# Motor agronômico — contrato do MVP

## Decisão de segurança

O motor é híbrido: regras determinísticas executam classificações e cálculos; IA apenas transforma a saída estruturada em linguagem clara. No MVP, nenhuma recomendação oficial é publicada sem aprovação de agrônomo responsável.

## Fluxo

`Importado → Validado → Calculado → Narrativa gerada → Em revisão → Aprovado → Publicado`

## Entradas obrigatórias

- Empresa, cliente, propriedade, talhão, safra e código da amostra.
- Coordenadas, sistema de referência, profundidade, data, grid e subamostras.
- Região técnica, cultura atual/próxima, sistema, meta produtiva e histórico disponível.
- Valor, unidade, método analítico, laboratório e origem de cada resultado.

## Bloqueios

- Unidade ou método desconhecido.
- Profundidade, região ou cultura incompatível com a regra.
- Coordenada fora do talhão ou amostra duplicada.
- Resultado impossível/incoerente.
- Extração por OCR ainda não conferida.
- Prescrição sem cultura e meta produtiva.

Mapas interpolados só podem ser gerados quando densidade e validação espacial forem suficientes; caso contrário, a interface apresenta pontos ou zonas e informa a limitação.

## Índice de Confiabilidade Técnica

| Dimensão | Peso |
|---|---:|
| Completude | 25% |
| Coerência laboratorial | 25% |
| Compatibilidade de regra | 20% |
| Contexto agronômico | 15% |
| Qualidade espacial | 15% |

- 90–100: alta.
- 75–89: adequada.
- 50–74: limitada.
- abaixo de 50: insuficiente e bloqueada.

O índice indica qualidade dos dados e aderência às regras; não é probabilidade estatística de acerto.

## Versionamento

Cada conjunto possui código, versão semântica, hash, região, culturas, profundidades, métodos, fontes, autor, revisores, aprovador e validade. Uma versão ativa é imutável. Cada laudo guarda versão e hash para reprodução futura.

## Papel do pesquisador Cabeda

Homologar a biblioteca técnica, validar casos de teste, aprovar novas regiões/culturas e revisar exceções. Isso converte o conhecimento de campo em um ativo escalável sem retirar a responsabilidade profissional da decisão publicada.
