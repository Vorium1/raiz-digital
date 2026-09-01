# Handoff — Raiz Digital MVP 0.3

## Objetivo desta versão

Começar a substituir demonstração por comportamento executável sem abandonar a arquitetura original. O primeiro núcleo funcional escolhido foi a entrada laboratorial, porque ela alimenta todo o motor agronômico e precisa ser confiável antes de IA, mapas interpolados ou recomendação.

## Implementado de verdade

### Importação CSV

- Leitura real de arquivo CSV/TXT no navegador.
- Envio do conteúdo para `POST /api/import/validate`.
- Detecção de delimitador `;`, `,` ou tabulação.
- Suporte a dois formatos:
  - tabela longa: amostra + parâmetro + valor + unidade + método;
  - tabela ampla: uma amostra por linha e parâmetros em colunas.
- Normalização de decimal brasileiro e internacional.
- Reconhecimento inicial de pH, SMP, P, K, Ca, Mg, Al, H+Al, CTC, V%, MO, carbono orgânico, S, B, Zn, Cu, Mn, Fe e argila.
- Detecção de duplicidade amostra/parâmetro/método.
- Bloqueio de valor inválido, amostra ausente, unidade desconhecida, método ausente e estrutura incompatível.
- Aviso explícito quando unidade ou método foram inferidos.
- Cálculo do Índice de Confiabilidade Técnica usando os pesos já definidos no contrato do motor.
- Prévia normalizada com amostras, parâmetros, resultados, bloqueios e alertas.

### Fluxo de nova análise

- “Importar laudo” agora abre diretamente a etapa laboratorial.
- A etapa de conferência calcula o estado inicial da análise:
  - `AWAITING_LAB` sem arquivo;
  - `IMPORTED` quando o arquivo passa sem bloqueios;
  - `INCONSISTENT` quando existem bloqueios.
- Nenhuma recomendação é gerada automaticamente.
- A interface deixa claro que inferências de unidade/método precisam de conferência humana.

### Validação automatizada

- `npm run test:domain`: 4 cenários do importador (válido, duplicidade, tabela ampla sem método inventado e CSV separado por vírgula).
- Transpilação sintática de todos os arquivos TS/TSX: 0 erros.
- Build completo do Next.js continua dependente da instalação das dependências pelo registry.

### Banco de dados

Nova migration `002_tenancy_and_imports.sql`:

- função de contexto `app.current_tenant_id()`;
- RLS para as principais entidades multiempresa;
- triggers de `updated_at`;
- `analysis_imports` para registrar cada sessão de importação;
- `analysis_import_rows` para guardar a forma normalizada e rastreável;
- índices operacionais.

## O que continua pendente

- Driver PostgreSQL/ORM conectado à aplicação.
- Sessão/autenticação e definição segura de `app.tenant_id` por request/transação.
- Persistência efetiva do resultado da importação nas tabelas novas.
- XLSX: adaptador específico.
- PDF/OCR: adaptador específico com conferência obrigatória.
- Mapeamento manual de colunas para laboratórios fora do dicionário inicial.
- Biblioteca de métodos por parâmetro/laboratório homologada.
- Primeiro conjunto de regras agronômicas executável e homologado.

## Regra importante

A unidade padrão inferida pelo importador serve apenas para pré-validação e nunca substitui a informação oficial do laboratório. Se o arquivo não trouxer unidade/método, a interface deve sinalizar a inferência e exigir conferência antes da interpretação.

## Próxima versão — 0.4

1. Conectar PostgreSQL/PostGIS com um adaptador simples e self-hostable.
2. Implementar sessão e RBAC no servidor.
3. Persistir clientes, propriedades, talhões, análises e importações.
4. Criar adaptadores de laboratório configuráveis, começando pelos arquivos reais do piloto.
5. Implementar o primeiro rule set homologado com casos de teste conhecidos.
6. Substituir métricas demo por consultas reais gradualmente.
