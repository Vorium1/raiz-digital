# Handoff — RAIZ Digital MVP 0.4

## Objetivo

Transformar a base visual/técnica das versões anteriores no primeiro núcleo multiempresa persistente, sem antecipar o motor agronômico e sem mascarar módulos pendentes com dados fictícios.

## Implementado

### Banco

- dependência `pg` adicionada;
- `src/lib/db.ts` com pool lazy e transação `withTenant`;
- runner `scripts/migrate.mjs`;
- migration `003_identity_and_persistence.sql`;
- `user_sessions`;
- `app.current_user_id()`;
- RLS em `audit_events` e laboratório scoped;
- memberships pré-sessão por função `SECURITY DEFINER`;
- ajuste da restrição de `analysis_import_rows` para preservar duplicidades laboratoriais por linha de origem.

### Autenticação

- Argon2;
- token opaco aleatório;
- SHA-256 do token no banco;
- cookie HttpOnly;
- expiração em 12 horas;
- revogação no logout;
- membership revalidada ao ler a sessão;
- seleção de tenant quando houver mais de uma empresa.

### Persistência / APIs

- `GET/POST /api/clients`;
- `GET /api/context`;
- `POST /api/properties`;
- `POST /api/fields` com GeoJSON e cálculo PostGIS da área;
- `POST /api/crop-seasons`;
- `GET/POST /api/analyses`;
- `POST /api/import/commit` com revalidação server-side;
- auditoria nas criações e importações.

### UI real

- login;
- dashboard com contagens reais;
- carteira de clientes com cadastro real;
- lista e detalhe de análises reais;
- fluxo de nova análise capaz de criar registro e persistir CSV quando há safra cadastrada;
- membros reais do tenant em Configurações;
- telas não conectadas deixam de exibir números fictícios no modo `database`;
- demo continua disponível, sempre identificada.

## Validações executadas neste ambiente

- `npm run test:domain`: 4 cenários aprovados;
- `npm run test:security`: token/hash/TTL aprovados;
- `npm run check:migrations`: contratos estruturais aprovados;
- transpilação sintática TypeScript/TSX de todo `src` e `scripts`: 0 erros.

## Não validado neste ambiente

Não foi possível instalar dependências pelo registry npm. Portanto não declarar como aprovado:

- `npm install`;
- `npm run typecheck` completo com os tipos reais de `pg` e Argon2;
- `npm run build`;
- execução das migrations em PostgreSQL/PostGIS real;
- seed real;
- login real;
- testes de RLS em duas empresas reais.

O primeiro CI/ambiente com internet deve executar exatamente essa sequência antes de deploy.

## Pendências obrigatórias

- UI para propriedade/talhão (as APIs já existem);
- associação real de ordem de coleta no wizard;
- 2FA e recuperação de senha;
- convite/gestão de membros;
- rate limiting de autenticação;
- storage do arquivo bruto importado;
- XLSX e PDF/OCR;
- biblioteca de laboratórios/métodos homologada;
- rule set agronômico executável e homologado;
- revisão/aprovação real;
- PDF final e assinatura;
- Mercado Pago real;
- jobs/fila;
- E2E multiempresa com PostgreSQL/PostGIS.

## Próxima versão sugerida — 0.5

Priorizar a **cadeia de campo real**: cadastro visual de propriedade/talhão, importação/desenho de polígono, ordem de coleta, pontos GPS e vínculo espacial com as amostras de laboratório. Em paralelo, preparar o primeiro rule set homologado sem publicar recomendação ainda.
