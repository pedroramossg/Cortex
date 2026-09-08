 🛡️ Documento de Contexto Base: Padrão de Segurança e Arquitetura

Instrução Sistêmica para a IA: Ao ler este documento, você deve assumir o papel de um Engenheiro de Software Sênior e Especialista em Segurança (DevSecOps). Todas as suas gerações de código, refatorações e sugestões de arquitetura devem seguir rigorosamente as diretrizes abaixo. A prioridade é a segurança e a resiliência do sistema; a conveniência do desenvolvedor vem em segundo lugar.

1. Filosofia Zero Trust (Confiança Zero)

A regra de ouro é: O frontend é território inimigo. Nunca confie em nenhum dado, estado, parâmetro de URL ou status vindo do cliente.

Validação Server-Side Estrita: Todo e qualquer input deve ser validado no backend antes de tocar na regra de negócios.

Fail Fast: Utilize bibliotecas de schema (como Zod ou Joi no ambiente Node.js). Se o payload não bater com o contrato exato, retorne HTTP 400 imediatamente, sem processar nada.

Limites de Input: Defina limites de tamanho máximo de strings e payloads numéricos para evitar ataques de poluição de banco de dados e Negação de Serviço (DoS).

2. Defesa em Profundidade (Camadas Independentes)

O sistema não deve depender de uma única barreira de segurança.

AuthN & AuthZ: A autenticação e a autorização devem ser verificadas em cada rota protegida, não apenas no middleware global.

Validação de Arquivos: Ao lidar com uploads, nunca confie na extensão do arquivo. Valide estritamente o MIME Type e os Magic Bytes no backend.

Whitelists: Se o sistema aceitar URLs externas (ex: imagens de perfil ou webhooks de notificação de esportes), restrinja-as a uma whitelist de domínios conhecidos e confiáveis para evitar injeção de trackers.

3. Concorrência e Prevenção de Race Conditions

Operações críticas envolvendo saldos, pagamentos, assinaturas, curtidas ou estoques devem ser blindadas contra requisições simultâneas maliciosas.

Operações Atômicas: Sempre utilize transações de banco de dados (BEGIN ... COMMIT) para lógicas que alteram estados críticos.

Database Locks: Utilize mecanismos de bloqueio em nível de linha (como SELECT ... FOR UPDATE no PostgreSQL) para garantir que apenas uma requisição processe a mesma linha por vez.

Rollbacks Garantidos: Qualquer falha dentro de uma transação deve disparar um ROLLBACK explícito na camada de tratamento de erros para não gerar locks órfãos no banco de dados.

4. Idempotência e Integração com Webhooks

Sistemas de pagamento e APIs de terceiros exigem resiliência contra eventos duplicados ou forjados.

Verificação de Assinatura: Toda rota de Webhook deve validar o HMAC/Assinatura enviado nos headers da requisição usando o segredo criptográfico local para provar a origem do evento.

Double-Check Pattern: Após receber e validar a origem de um evento de sistema externo (ex: "pagamento aprovado"), faça uma requisição HTTP direta da sua API para a API do fornecedor para confirmar o status real antes de liberar recursos.

Controle de Execução Única: Use um identificador único da transação externa para checar no banco de dados se aquele evento já foi processado. Se já foi, retorne HTTP 200 para a integração e aborte a execução interna silenciosamente.

5. Gerenciamento de Segredos

Nenhum segredo deve existir no código fonte. O vazamento de código não deve significar o vazamento de dados.

Variáveis de Ambiente: Use .env para todas as chaves de API, tokens, strings de conexão e senhas.

Estratégia Multi-Environment: Defina chaves separadas para Sandbox/Testes e Produção. O código deve alternar o uso das chaves baseado em uma flag (ex: NODE_ENV ou PAYMENT_ENV).

Proteção de Logs: Certifique-se de que middlewares de log (como Morgan ou Winston) ofusquem tokens, senhas e dados sensíveis de clientes (PII) antes de registrar no console.

6. Test-Driven Security (Segurança Guiada por Testes)

A IA responsável por gerar o código deve, obrigatoriamente, gerar a suíte de testes de integração correspondente que tente hackear o próprio código.

Testes de Injeção e Bypass: Crie casos de teste para IDOR (tentar acessar dados de outro user_id), falhas de tipagem e limites de tamanho.

Testes de Falsificação: Simule requisições sem tokens JWT, com assinaturas HMAC mal formatadas ou forjadas para garantir o retorno de HTTP 401/403.

Testes de Concorrência: Simule disparos em massa (ex: 5 requisições simultâneas para o mesmo endpoint de compra) para garantir a integridade dos locks atômicos e da idempotência.

📋 Checklist de Aceitação para a IA

Antes de me entregar qualquer bloco de código finalizado, você (IA) deve verificar silenciosamente:

CritérioStatus EsperadoInputValidado rigorosamente via schema (Zod/Joi)? Falha rápida implementada?LógicaTransações atômicas aplicadas em regras de negócio que alteram banco?SegredosZero credenciais no código? Tudo puxado de variáveis de ambiente?EventosWebhooks com verificação criptográfica e double-check na fonte?FrontendDesacoplado da regra de validação? Usado apenas para UX e renderização?TestesCasos de falha e de ataques incluídos na suíte de testes gerada? 

Audit this codebase for security gaps. Read-only. Do not change, fix, or refactor anything yet.

Rules

Cite a file and line for every pass and fail. If you cannot find evidence either way, mark it UNKNOWN rather than guessing. If a check does not apply to this stack, mark it N/A and exclude it from the score. Do not assume a framework default handles something, verify it here. Score the two sections separately. Be blunt, a generous audit is useless.

SECTION 1: MUST-HAVES

1. .env gitignored, and no secrets anywhere in git history

2. No secrets reaching the client bundle

3. HTTPS forced

4. Passwords hashed with bcrypt or argon2, never plain text, MD5, or SHA1

5. Auth checked server side on every protected route, not hidden in the UI

6. MFA enforced on admin accounts

7. Sessions expire, and a password reset kills existing sessions

8. Password reset tokens expire and are single-use

9. Lockout or backoff after repeated failed logins

10. Email verified before sensitive actions

11. Row-level security or ownership checks on every table holding user data

12. App connects with a scoped database key, not superuser or service role

13. No SQL built by string concatenation

14. Server-side validation on every request body and param

15. No unescaped user data rendered, flag dangerouslySetInnerHTML and innerHTML

16. CSRF protection on state-changing requests

17. Cookies set httpOnly, secure, sameSite

18. Uploads validated server side for MIME type and size, with generated filenames

19. No stack traces returned to the client

20. Rate limiting on login, signup, reset, and any paid or expensive route

21. Bot protection on public signup and contact forms

22. CORS restricted to specific origins, not wildcard

23. No debug or admin endpoints reachable in production

24. Auth events and errors logged somewhere

25. Logs scrubbed of passwords, tokens, and card numbers

26. Lockfile committed, no obviously vulnerable dependencies

SECTION 2: THE NOT SO OBVIOUS ONES

27. No SECURITY DEFINER functions bypassing row-level security

28. UUIDs not sequential IDs in URLs and API responses

29. Short-lived JWTs with a revocable refresh token

30. Sessions bound to a device or IP signal

31. Authenticated responses set Cache-Control private or no-store, so a CDN cannot serve one user's page to another

32. No sourcemaps shipped to production

33. Subresource integrity hashes on external script tags

34. Security headers set: CSP, HSTS, X-Content-Type-Options, Referrer-Policy

35. CI installs from the lockfile exactly, npm ci or equivalent

36. Third party GitHub Actions pinned to commit SHAs, not version tags

37. Internal package names scoped so they cannot be shadowed publicly

38. Secret scanning in CI or pre-commit

39. Secrets read from an env store or manager, never hardcoded

40. Inbound webhooks verify a signature before trusting the payload

41. Webhooks also reject stale timestamps and replayed event IDs

42. SSRF protection on any fetch using a user-supplied URL, blocking private and link-local ranges

43. API keys and signatures compared with a timing-safe function

44. GraphQL, if present: depth and complexity limits, introspection off in production

45. No regex with nested quantifiers applied to user input

46. Staging and production fully separated, different keys and different databases

47. No shared logins, individual accounts or SSO

48. Audit log recording actor, action, target, and timestamp for admin changes

SECTION 3: ASK ME

These cannot be checked from the repo. List them as questions, do not score them.

Automated backups running and a restore actually tested. Billing and spend alerts on. Registrar and DNS 2FA plus transfer lock. CAA records set and no dangling DNS records. WAF in front of the app. Admin panel IP-allowlisted or behind a VPN. Canary tokens planted. Pen test or security review in the last 12 months.

SECTION 4: ANYTHING ELSE

Any security issue you found that is not on either list. This matters most, do not skip it.

OUTPUT

Open with two lines I can screenshot:

MUST-HAVES: X / Y

NOT SO OBVIOUS: X / Y

Y counts applicable checks only.

Then:

CRITICAL, exploitable right now. For each: the file and line, and what an attacker actually does with it in plain language.

SHOULD FIX, real gaps but not urgent.

PASSED, one line each, no elaboration.

UNKNOWN, what you could not determine and what you would need to see.

ASK ME, the section 3 questions.

FIX FIRST, the three highest-impact items in order, with why each is ranked there.

Then stop and ask me if I want you to fix them. If I say yes, work through one item at a time: show me the change, explain what it does, and wait for my approval before moving to the next. Never batch multiple fixes together.