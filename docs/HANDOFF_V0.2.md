# Handoff — Raiz Digital MVP 0.2

## Objetivo desta versão

Transformar o alicerce técnico 0.1 em uma experiência operacional simples, familiar e responsiva, sem remover a profundidade necessária para a futura plataforma agronômica.

## Alterações concluídas

### Navegação

- Sidebar desktop reorganizada em **Principal** e **Gestão**.
- Ação direta **Criar nova análise** destacada na sidebar.
- Navegação mobile inferior com cinco ações: **Início, Clientes, Criar, Análises e Mais**.
- Botão central de criação com destaque visual e área de toque ampliada.
- Menu **Mais** em sheet expansível com Coletas e mapas, Relatórios, Histórico, Financeiro e Configurações.
- Estado ativo sincronizado com a rota atual.

### Dashboard

- Bloco **Continuar de onde parei** apontando para a análise recente.
- Progresso e contexto da tarefa recente visíveis no desktop.
- Atalhos para revisar análises, importar laudo/iniciar análise, programar coleta e acessar clientes.
- Agenda passou a ter destino navegável em vez de botão sem ação.

### Acessibilidade e interação

- Link de salto para o conteúdo principal.
- `:focus-visible` consistente para teclado.
- Labels acessíveis adicionados a buscas, filtros e botões somente com ícone.
- Estados de toque/active padronizados.
- Respeito a `prefers-reduced-motion`.
- Navegação mobile com `aria-expanded`, `aria-controls`, `aria-current` e rótulos de navegação.

## Arquivos principais alterados

- `src/app/layout.tsx`
- `src/app/(platform)/layout.tsx`
- `src/app/(platform)/dashboard/page.tsx`
- `src/app/(platform)/clientes/page.tsx`
- `src/app/(platform)/analises/page.tsx`
- `src/app/(platform)/coletas/page.tsx`
- `src/app/(platform)/historico/page.tsx`
- `src/app/(platform)/relatorios/page.tsx`
- `src/app/globals.css`
- `src/components/sidebar.tsx`
- `src/components/topbar.tsx`
- `src/components/mobile-navigation.tsx` (novo)
- `README.md`
- `package.json`

## Validação realizada neste ambiente

- Transpilação sintática de todos os arquivos `.ts`/`.tsx` com TypeScript: **PASS**.
- Rotas principais verificadas por estrutura de arquivos.
- O `npm install` foi tentado, mas não concluiu dentro do limite do ambiente; portanto o build real de Next.js deve ser executado em ambiente com acesso ao registry antes de publicação.

## Funcionalidade real x demonstrativa

### Real no frontend

- Navegação entre as rotas existentes.
- Menu mobile expansível.
- Fluxo local do wizard de nova análise.
- Layout responsivo e estados de interação.

### Demonstrativa

- Métricas, clientes, análises, agenda, mapa, histórico e parecer técnico.
- Ação final de criação de análise.
- Aprovação/revisão técnica.
- Importação GPS/laudo.
- Financeiro.

### Integrações pendentes

- Autenticação e RBAC reais.
- PostgreSQL/PostGIS conectado à aplicação.
- Persistência multiempresa e RLS.
- Importação de planilhas/laudos/GPS.
- Storage S3 compatível.
- Worker/fila PostgreSQL.
- Motor agronômico executável com regras homologadas.
- Mercado Pago real.
- E-mail/notificações.

## Próxima versão recomendada — 0.3

1. Escolher ORM/migrador PostgreSQL sem alterar o monólito modular.
2. Conectar autenticação self-hostable e isolamento por tenant.
3. Persistir clientes, propriedades, talhões e análises.
4. Criar importador real de planilha/laboratório com tela de mapeamento de colunas.
5. Implementar validações do primeiro conjunto de regras homologado.
6. Substituir gradualmente dados demo por dados persistidos, mantendo estados vazio/erro/carregamento.

## Regra de produto preservada

Nenhuma recomendação agronômica oficial deve ser publicada automaticamente. O motor determinístico calcula e classifica; a IA pode redigir a narrativa; a publicação depende da aprovação do agrônomo responsável.
