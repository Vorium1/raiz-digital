# Roadmap de Produto — RAIZ Digital

Atualizado em **2026-09-25**.

Este roadmap substitui a sequência histórica 0.5 → 1.0 como guia operacional. O histórico antigo permanece em `docs/PROJECT_STATE.md` e `docs/V0.5_INTERRUPTED.md`.

## Norte

Construir a cadeia técnica confiável antes de ampliar automações e integrações. Dados, rastreabilidade, espacialidade, regra agronômica, revisão profissional e operação simples continuam tendo prioridade sobre “IA bonita”.

## Entregue / base consolidada

### Campo e tenancy
- propriedades/talhões;
- desenho/importação de polígono;
- ordens de coleta;
- grid/pontos;
- GPS e registro de coleta;
- vínculo coleta → amostra → laudo;
- RLS/RBAC multiempresa;
- E2E de isolamento em fluxos críticos.

### Laboratório
- CSV;
- XLSX;
- normalização/revalidação server-side;
- cadastro de laboratórios;
- rastreabilidade de método/unidade/origem;
- armazenamento bruto via adapter local/S3 compatível.

### Segurança
- sessão opaca;
- Argon2;
- cookie HttpOnly;
- 2FA/TOTP;
- recuperação de senha;
- rate limiting de login;
- gestão de equipe;
- auditoria.

### Inteligência agronômica
- motor determinístico versionado;
- regras/catálogos técnicos;
- interpretação e prescrição;
- revisão/aprovação;
- contexto de produtividade;
- fertilidade, calagem, N/P/K/S e demais módulos implementados no catálogo atual;
- clima, irrigação, biologia e contexto espacial como enriquecimento;
- NDVI versionado e custódia de raster;
- cenários comerciais separados da necessidade agronômica.

### Entrega oficial
- snapshot oficial imutável;
- republicação versionada;
- resumo simples para o produtor;
- cálculo de total da área quando exato;
- plano comercial opcional congelado no laudo;
- produto/preço/custo apenas quando explicitamente congelados;
- QA desktop/mobile/print para os fluxos recentes.

### Financeiro — fundação
- Checkout Pro por fatura implementado;
- webhook assinado;
- consulta do recurso oficial após webhook;
- idempotência e reconciliação;
- gate `MERCADO_PAGO_CHECKOUT_ENABLED`.

Recorrência automática, carência e bloqueio financeiro continuam desligados até homologação comercial específica.

## Próximos blocos reais

### 1. Robustez operacional
- ampliar smoke tests autenticados e pós-release;
- consolidar observabilidade de erros/runtime sem expor dados sensíveis;
- manter auditorias de migration drift e restore/PITR;
- validar fluxo GPS em navegador/dispositivo real e casos de precisão/distância;
- cobrir geometrias de borda (ex.: talhões muito extensos/zonas UTM) com casos reais.

### 2. Documentos e entrada avançada
- PDF nativo de laboratório, quando o formato permitir extração determinística;
- OCR somente com conferência humana e proveniência;
- KML/GPX apenas se houver necessidade operacional confirmada;
- PDF/arquivo final assinado quando o modelo de responsabilidade técnica for definido.

### 3. Homologação comercial
- homologar Checkout Pro em ambiente autorizado;
- validar pagamentos de teste ponta a ponta;
- definir política de cobrança/recorrência;
- definir carência, lembretes e eventual bloqueio;
- manter qualquer alteração de acesso separada da simples recepção do webhook.

### 4. Produto agronômico
- continuar ampliando culturas/regiões apenas com fonte rastreável;
- aprofundar taxa variável/interpolação somente onde densidade e validação espacial forem suficientes;
- ampliar análise biológica por métodos/laboratórios;
- evoluir clima/doenças/irrigação sem transformar contexto opcional em requisito bloqueante;
- expandir histórico de manejo, aplicação e produtividade.

### 5. Governança e conformidade
- revisar LGPD/termos/política de retenção aplicáveis ao modelo comercial;
- definir política formal de versionamento do produto (o `package.json` ainda preserva `0.5.0-dev.1` histórico);
- definir processo de assinatura/responsabilidade técnica nos documentos finais;
- manter runbook de incidentes, restore e rollback.

### 6. Escala
Somente quando houver necessidade medida:
- fila/job runner para tarefas longas;
- otimizações de consulta/cache;
- integração via API externa;
- automações adicionais;
- novos provedores de mapas/satélite/storage.

Não introduzir infraestrutura distribuída por antecipação.

## Critérios para puxar um item

Um item entra em implementação quando:
1. resolve uma dor real observada ou requisito comercial confirmado;
2. tem critério de aceite verificável;
3. não duplica capacidade já existente;
4. preserva rastreabilidade e tenancy;
5. tem caminho de teste/homologação;
6. não exige mudança de produção sem gate e autorização explícita.

## Itens que não devem ser “refeitos”

Não abrir novamente como backlog genérico:
- 2FA;
- recuperação de senha;
- RLS;
- revisão/aprovação;
- XLSX;
- motor determinístico;
- resumo do produtor;
- plano comercial no laudo;
- webhook Mercado Pago base;
- S3 adapter base.

Esses itens podem receber melhorias específicas, mas já não são pendências de implementação inicial.
