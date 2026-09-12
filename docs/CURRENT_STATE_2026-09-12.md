# RAIZ Digital — Estado atual em 2026-09-12

Este arquivo é o handoff operacional mais recente. Em caso de conflito com documentos antigos de estado, este documento prevalece para as decisões tomadas até 2026-09-12.

## Objetivo do produto

A RAIZ Digital está sendo posicionada como plataforma B2B de inteligência agronômica e decisão, não como CRUD/ERP de análises de solo. A experiência precisa justificar ticket mensal premium, conectando dado de campo/laboratório a interpretação, revisão profissional, recomendação e entrega auditável.

## Baseline integrada em `develop`

Commit de referência após a entrega premium: `2ef5b1b0b4f17a0f27482319f02170b137b3eeaa`.

Validação desta baseline no GitHub Actions:

- typecheck: aprovado;
- suíte `test:handoff`: aprovada;
- build de produção: aprovado;
- Vercel Preview das branches anteriores: aprovado;
- `main`/produção não foi alterada.

## Ciclo de decisão implementado

Fluxo operacional consolidado:

`laudo → validação → interpretação determinística → aprovação técnica → Recomendação Assistida RAIZ → revisão profissional → decisão oficial publicada`.

Princípios obrigatórios:

- classificação/cálculo vêm do motor determinístico e das regras homologadas;
- IA não inventa faixa, dose, fonte ou número ausente;
- recomendação só é liberada depois de interpretação `APPROVED`;
- publicação oficial exige recomendação `APPROVED` da mesma interpretação;
- revisão profissional é gate de código, não apenas texto de interface;
- cliente vê a marca RAIZ, não fornecedor/modelo de linguagem;
- conteúdo publicado é imutável e verificável por hash.

## Relatório premium / decisão oficial

O relatório foi elevado de tabela técnica para documento de decisão:

- resumo executivo da decisão;
- prontidão/gates da decisão;
- contexto do cliente, propriedade, talhão e safra;
- resultados laboratoriais;
- classificações homologadas;
- síntese técnica RAIZ;
- Recomendação Assistida RAIZ;
- práticas priorizadas e informações ainda faltantes;
- regra explícita de “sem dose inventada” quando a evidência não sustenta valor numérico;
- pontos de amostragem e origem espacial;
- aderência recomendado × aplicado na versão atual;
- responsável técnico e trilha de auditoria.

### Snapshot oficial v3

Novas publicações congelam no momento da entrega:

- contexto da análise;
- marca do tenant;
- saída estruturada da interpretação;
- contorno do talhão;
- pontos de amostragem;
- síntese aprovada, quando existente;
- recomendação aprovada da mesma interpretação;
- data, usuário e revisão de publicação.

A versão oficial é persistida antes da criação da linha `reports`; falha de armazenamento cancela a publicação. O hash SHA-256 continua sendo verificado ao reabrir o documento.

Snapshots v1/v2 continuam legíveis, mas qualquer conteúdo que não era congelado naquele formato permanece explicitamente indisponível em vez de ser preenchido com dado vivo.

## Armazenamento da entrega

`reports.storage_key` é `text`, portanto suporta o provider inline atual. O provider inline é limitado no código a 1,5 MB por snapshot. Em Vercel, isso evita filesystem efêmero como fonte de verdade. Para escala maior, S3/R2/Blob deve substituir o provider inline sem alterar a semântica do relatório.

Arquivos brutos de laboratório continuam sendo um item diferente: não devem ser armazenados inline; object storage dedicado ainda é necessário antes de depender de arquivamento permanente desses arquivos em produção.

## Cabeda — golden case real

Os laudos reais continuam sendo o principal caso de aceitação de ponta a ponta.

Semântica atual:

- classificados/homologados no perfil de Soja: CA, MG, MO, Cu, Zn, P e K;
- auxiliares/contextuais, não alvo de classificação estática: argila, pH, SMP, H+Al e Al;
- ainda aguardando homologação específica: CTC, S, B e Mn;
- dado auxiliar não pode virar “pendência de interpretação” só por não possuir faixa estática.

O motor já valida compatibilidade de unidade/método/profundidade/regra antes de classificar.

### Georreferenciamento Cabeda 01 e 02

Os pacotes espaciais reais foram auditados fora do Git:

- `CABEDA 01` corresponde à Área 01;
- `CABEDA 02` corresponde à Área 02;
- `amostrasreal` é a fonte preferencial da posição executada;
- `contorno` é a fonte do limite real;
- os arquivos não possuem `.prj`;
- as geometrias estão em longitude/latitude decimal compatível com GPS;
- o datum exato de origem não pode ser provado a partir do pacote e deve continuar registrado como não declarado;
- não deve haver reprojeção numérica inventada apenas para atribuir um EPSG de origem;
- todos os pontos auditados estão coerentes com seus respectivos contornos;
- Área 03 permanece sem pacote espacial real e não deve receber geometria inferida.

O script `scripts/import-cabeda-real-geometry.mjs` implementa essa política em modo fail-closed, DRY-RUN por padrão, com auditoria antes/depois e `CABEDA_GEO_APPLY=true` apenas para gravação deliberada.

**Não commitar GeoJSON, shapefile, coordenadas exatas nem pacotes brutos de cliente.**

## Segurança / pré-lançamento

Antes de inserir novos dados privados de clientes em qualquer fluxo de produção:

1. o repositório deve estar privado;
2. credenciais reais nunca podem aparecer em código, docs ou histórico Git;
3. banco de runtime deve continuar usando papel restrito/RLS, não o papel administrativo de migration;
4. arquivos brutos devem ir para storage privado durável;
5. backups/restore e monitoramento precisam de ensaio operacional;
6. `main` continua protegida como produção e só recebe promoção depois de validação do Preview.

## Próximos blocos, em ordem

1. fechar o golden case Cabeda em DEV com geometria real 01/02 e fluxo completo até decisão oficial;
2. homologar, com fonte/revisão agronômica, CTC/S/B/Mn antes de ampliar a cobertura técnica;
3. consolidar experiência espacial/satélite: séries NDVI, qualidade de nuvem, comparação temporal e cruzamento com solo sem linguagem causal indevida;
4. polimento comercial final de Dashboard, Talhão 360, Central de Decisões, Mapas e Relatórios;
5. object storage, backup/restore, observabilidade e checklist de lançamento;
6. somente depois de homologação do Preview promover `develop` para `main`.

## Regra de produto

Uma funcionalidade nova só entra se aumentar pelo menos um destes fatores: confiança técnica, redução de trabalho operacional, clareza da próxima decisão ou valor percebido pelo cliente. Não abrir módulos aleatórios apenas para aumentar quantidade de telas.
