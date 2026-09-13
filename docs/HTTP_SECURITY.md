# RAIZ Digital — baseline de segurança HTTP

Estado: **implementado em `next.config.ts` e coberto por `test:http-security`**.

## Headers aplicados globalmente

A aplicação envia em todas as rotas:

- `Strict-Transport-Security: max-age=31536000`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`;
- `X-DNS-Prefetch-Control: off`;
- `X-Permitted-Cross-Domain-Policies: none`.

A política de permissões mantém geolocalização somente para a própria origem porque o fluxo de campo usa GPS real no navegador. Câmera e microfone permanecem bloqueados por padrão porque a versão atual não depende dessas APIs.

## Por que CSP não foi ativada neste bloco

`Content-Security-Policy` não foi adicionada às pressas. A RAIZ usa recursos externos legítimos — mapa/tile imagery, integrações e redirecionamento de checkout — e uma CSP incompleta pode quebrar operação real silenciosamente. Antes de ativá-la é necessário inventariar as origens efetivamente usadas no browser e validar em Preview, primeiro em modo report-only quando aplicável.

Isso não significa ausência de proteção: o baseline acima já reduz clickjacking, MIME sniffing, vazamento de referrer e uso indevido de APIs do navegador sem introduzir uma quebra funcional conhecida.

## Gate de regressão

`npm run test:http-security` valida:

- presença e unicidade dos headers esperados;
- proteção contra framing e MIME sniffing;
- geolocalização restrita a `self`;
- câmera/microfone bloqueados;
- ausência deliberada de CSP até existir uma matriz homologada de origens.

O teste integra `npm run test:handoff`, portanto uma alteração acidental nessa baseline bloqueia o CI antes de merge.
