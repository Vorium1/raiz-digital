# Backlog operacional

## P0 — Issue #128: multiempresa, usuários e cadastro mestre

Em andamento na branch `work/codex-night-multitenant-2026-09-30`, baseada em
`feature/report-dose-completeness` (`2e756b078fb044f8f35c675e8aec408b3f1d8b5f`).

Concluído neste corte:

- cadastro mestre de cliente PF/PJ, CPF/CNPJ validado e documento normalizado;
- unicidade de documento limitada ao tenant e sem inferir registros legados;
- arquivamento lógico, preservando propriedades e histórico técnico;
- rota `GET /api/clients/:id` para Cliente 360°, sempre escopada por tenant;
- contrato de teste para documento, RLS, filtro ativo e IDOR por UUID.

Próximo trabalho seguro: ampliar a matriz executável de RBAC/RLS para todos os
endpoints de cadastro e consolidar a distinção de administração de plataforma
sem confundir o curador técnico global com administrador de tenant.
