# RAIZ Digital — Master Handoff para Claude

## 1. Objetivo do handoff

Este pacote transfere o desenvolvimento da RAIZ Digital sem perder decisões, arquitetura ou trabalho concluído. O executor seguinte deve agir como engenheiro de software do projeto, preservando as decisões de produto e segurança já estabelecidas.

**Não começar do zero. Não criar uma “nova RAIZ”. Continue esta base.**

## 2. Produto

RAIZ Digital é uma plataforma de inteligência agronômica que transforma dados de campo e laboratório em informação rastreável para decisão técnica.

Assinatura: **Do solo à decisão, com precisão.**

A proposta central é unir:

- clientes, propriedades, talhões e safras;
- ordens de coleta, grids, pontos e GPS;
- laudos laboratoriais e normalização;
- validação técnica;
- motor agronômico versionado;
- revisão profissional;
- mapas, relatórios e histórico;
- governança multiempresa;
- futura camada de IA somente como assistência/narrativa.

## 3. Estado real recebido

### Baseline consolidada: v0.4

A v0.4 introduziu o primeiro núcleo persistente e multiempresa:

- PostgreSQL/PostGIS;
- migrations executáveis;
- sessão real self-hosted;
- Argon2;
- cookie HttpOnly;
- RBAC inicial;
- RLS;
- clientes, propriedades, talhões, safras e análises persistentes;
- importação CSV laboratorial com revalidação server-side;
- auditoria;
- dashboard/listas em modo database sem dados fictícios;
- separação explícita entre `demo` e `database`.

### Trabalho iniciado na v0.5

Existe um bloco **incompleto** de operações de campo:

- migration `004_field_operations.sql`;
- parser de pontos CSV/GeoJSON;
- criação/listagem de ordens de coleta;
- geração de grid pelo PostGIS;
- importação de pontos;
- registro de coleta via GPS do navegador;
- repositório e APIs de `collection-orders`;
- primeira UI de operações de campo;
- teste unitário do parser de pontos.

Esse bloco foi interrompido e precisa de auditoria E2E antes de ser aceito.

## 4. O que já foi validado neste snapshot

Sem instalar dependências externas, foram executados com sucesso:

- `scripts/test-lab-import.mjs`: **4 cenários aprovados**;
- `scripts/test-security.mjs`: token opaco, hash e TTL aprovados;
- `scripts/test-field-operations.mjs`: **4 cenários aprovados**;
- `scripts/check-migrations.mjs`: contratos estruturais 001–003 aprovados.

Ainda **não** declarar como validado:

- migration 004 em PostgreSQL/PostGIS real;
- `npm install` neste ambiente;
- `npm run typecheck` completo;
- `npm run build`;
- RLS contra dois tenants reais;
- fluxo GPS em navegador real;
- geração espacial do grid em talhões reais;
- E2E do fluxo coleta → amostra → laudo.

## 5. Arquitetura preservada

### Aplicação

Monólito modular Next.js + TypeScript. UI e Route Handlers no mesmo produto, com regras em domínio e acesso ao banco em repositórios.

### Banco

PostgreSQL/PostGIS é a fonte oficial. `tenant_id` e RLS são barreiras obrigatórias. `withTenant()` define contexto da transação.

### Geoespacial

- WGS84/GeoJSON para intercâmbio;
- PostGIS para limites, pontos, área e distância;
- cálculo em projeção métrica adequada quando necessário;
- mapas interpolados somente quando houver densidade/qualidade suficientes.

### Integrações

Devem ser substituíveis. Não criar lock-in desnecessário. A infraestrutura inicial deve priorizar baixo ou zero custo recorrente.

## 6. Motor agronômico

A RAIZ não é um chatbot que “opina” sobre um laudo.

O fluxo oficial é:

`Importado → Validado → Calculado → Narrativa assistida → Em revisão → Aprovado → Publicado`

Regras técnicas precisam ser versionadas e reproduzíveis. IA pode:

- resumir;
- explicar;
- produzir narrativa a partir de saída estruturada;
- auxiliar revisão.

IA não pode:

- inventar método analítico;
- inferir unidade ausente como fato;
- criar recomendação oficial fora de rule set homologado;
- publicar sem aprovação profissional.

O primeiro rule set deve ser homologado com especialista agronômico e ter casos de teste conhecidos antes de chegar ao usuário final.

## 7. Segurança e tenancy

Obrigatório preservar:

- Argon2;
- cookie HttpOnly;
- token opaco e hash no banco;
- sessão expirada/revogada bloqueada;
- RBAC server-side;
- RLS;
- auditoria;
- secrets somente no ambiente;
- validação de webhook;
- futuras URLs temporárias para documentos privados.

Antes de produção ainda faltam 2FA administrativo, recuperação de senha, convites, rate limiting e testes de restauração/backup.

## 8. UX e marca

A plataforma deve parecer profissional e tecnológica sem se tornar gamificada ou difícil de operar. Mobile é prioridade.

Marca oficial:

- Grafite Florestal `#10231F`;
- Verde Digital `#00BFA6`;
- Ciano Precisão `#34D9D0`;
- Cobre do Solo `#B86F3C`;
- Branco Quente `#F2F5F0`;
- títulos: Sora;
- interface/texto: Inter.

Consulte o PDF oficial em `docs/brand/Guia_de_Marca_Raiz_Digital.pdf`.

## 9. Sequência recomendada para o Claude

### Fase A — Auditoria do snapshot

1. `npm install`;
2. rodar todos os testes;
3. adicionar a migration 004 ao checker;
4. `npm run typecheck`;
5. `npm run build`;
6. subir `docker compose`;
7. migrations 001–004;
8. seed;
9. login e sessão;
10. teste multiempresa/RLS;
11. teste real das APIs de coleta;
12. teste mobile.

### Fase B — Fechar v0.5

- cadastro visual de propriedade/talhão;
- desenho/importação de polígono;
- ordem de coleta real;
- grid parametrizado;
- importação CSV/GeoJSON e depois KML/GPX quando necessário;
- captura GPS e precisão;
- validação dentro do talhão/distância do ponto planejado;
- acompanhamento de progresso;
- vínculo inequívoco entre ponto/amostra e resultado laboratorial;
- estados offline/erro pensados para campo, sem prometer PWA offline completa até ela existir.

### Fase C — v0.6

- adaptadores XLSX;
- PDF nativo;
- OCR somente com conferência obrigatória;
- biblioteca de laboratórios/métodos;
- storage S3 compatível;
- fila simples apoiada em PostgreSQL para tarefas longas.

### Fase D — v0.7

- primeiro rule set homologado;
- cálculo estruturado;
- confiança técnica;
- rastreabilidade da regra e fontes;
- casos de teste agronômicos conhecidos;
- sem recomendação pública automática.

### Fase E — v0.8

- revisão/aprovação;
- versionamento do parecer;
- relatório PDF;
- assinatura/responsabilidade;
- histórico comparativo por ponto/talhão/safra.

### Fase F — endurecimento comercial

- 2FA;
- recuperação de senha;
- convites;
- rate limiting;
- backup/restore testado;
- E2E multiempresa;
- observabilidade;
- cobrança e webhooks apenas quando o núcleo técnico estiver estável.

## 10. Critérios para não desviar do projeto

Antes de introduzir qualquer nova tecnologia pergunte:

1. resolve um problema real que a stack atual não resolve bem?
2. reduz custo/risco ou só troca complexidade de lugar?
3. mantém portabilidade dos dados?
4. pode ser substituída sem reescrever o produto?
5. é necessária agora?

Se a resposta não for clara, não introduza.

## 11. Entrega esperada de cada etapa

Ao finalizar um bloco, produzir:

- resumo objetivo;
- arquivos alterados;
- migrations;
- testes executados e resultado real;
- limitações restantes;
- riscos;
- próximos passos;
- commit(s) rastreáveis.

Não usar “concluído” como sinônimo de “código escrito”.
