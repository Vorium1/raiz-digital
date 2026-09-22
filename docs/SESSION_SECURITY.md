# RAIZ Digital — segurança de sessões

Estado: **gestão de sessões da própria conta implementada em `develop`/Preview**.

## Comportamento

- a sessão usa token opaco aleatório; somente o hash SHA-256 fica persistido;
- cookie é `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- TTL atual: 12 horas;
- a tela Configurações mostra somente as sessões ativas do usuário autenticado;
- o painel não expõe `ip_hash`, token, hash do token ou qualquer credencial;
- o usuário pode encerrar todas as outras sessões com uma única ação;
- a ação de revogação não recebe `userId` nem `sessionId` do navegador: usa exclusivamente a identidade já resolvida pela sessão atual;
- ao alterar a senha, todas as outras sessões são revogadas automaticamente e somente a sessão corrente permanece ativa;
- recuperação de senha continua com seu próprio fluxo endurecido e revogação de sessão conforme a implementação específica desse processo.

## Isolamento

A listagem consulta `user_sessions` sempre com `WHERE user_id = <usuário autenticado>`. Uma sessão aberta em outra empresa pode aparecer para o mesmo usuário — isso é intencional, porque é segurança da **conta**, não uma visão de dados do tenant. O nome da empresa é apenas contexto da própria sessão.

## Gate de regressão

`npm run test:security` valida por contrato que:

- a troca de senha recebe o `sessionId` da sessão autenticada;
- a atualização revoga outras sessões e preserva a atual;
- a rota manual de revogação usa `session.userId` + `session.sessionId` e não aceita identidade enviada no body;
- a listagem permanece escopada ao usuário autenticado;
- hash de IP não é exposto para o frontend.

Esse teste faz parte de `npm run test:handoff` e bloqueia o CI em regressão.
