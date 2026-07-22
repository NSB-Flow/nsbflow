## Objetivo

Auditoria de conformidade da fundação SaaS (sem mudar arquitetura). Abaixo o **relatório de divergências reais** encontrado a partir do schema, das policies e do código atual, seguido do **plano de correções mínimas** e da lista de placeholders.

---

## 1. Relatório de divergências

### 1.1 Isolamento multiempresa (RLS por `workspace_id`)

Tabelas com `workspace_id` e RLS ativas: `agent_runs`, `attachments`, `companies`, `subscriptions`, `workspace_members`, mais `workspaces` (id próprio). Corretamente sem `workspace_id`: `profiles`, `user_roles`, `user_credits`, `credit_transactions`, `referrals` (user-scoped), `plans`, `plan_features`, `coupons`, `app_settings`, `enterprise_module_grants`, `subscription_invoices` (globais/derivadas).

**Divergências reais nas policies:**

- **`agent_runs`** — SELECT/UPDATE/DELETE usam `created_by = auth.uid() OR has_role(admin|ceo|diretor)`. Não checam `is_workspace_member(auth.uid(), workspace_id)`. Consequências:
  - Um `admin` / `ceo` / `diretor` de qualquer workspace enxerga runs de **todos** os workspaces (vazamento cross-tenant).
  - Membros normais do mesmo workspace não conseguem ler runs de colegas, mesmo quando o produto sugere compartilhamento por empresa.
- **`attachments`** — uma única policy `ALL` com `created_by = auth.uid() OR has_role(admin)`. Mesmo problema: admin global lê/edita anexos de qualquer tenant; ninguém do mesmo workspace lê anexos do colega.
- **`companies`** — SELECT já é `is_workspace_member(..., workspace_id)` ✓. Mas **UPDATE/DELETE** ainda são `created_by = auth.uid() OR has_role(admin)`, sem checar o workspace. Um `admin` global edita/apaga empresas de outro tenant; e um `admin_empresa` do próprio workspace não consegue editar empresa criada por outro colega.
- **`subscriptions.subs_insert`** e **`workspaces.ws_insert`** — INSERT policies sem `WITH CHECK` restritivo (a criação de workspace hoje é feita pelo trigger `handle_new_user` e pelo fluxo manual em `app.workspaces.tsx`). Item a confirmar no fix (não é bug funcional agora, é hardening).

### 1.2 Trial de 3 dias e bloqueio pós-expiração

- Trigger `handle_new_user` cria assinatura `trialing` com `trial_ends_at = now()+3d` ✓
- `useEntitlements` calcula `isTrialExpired` corretamente ✓
- `_authenticated/app.tsx` faz `<Navigate to="/app/trial-expirado" />` com whitelist para `planos/checkout/assinatura/configuracoes/workspaces/ajuda/trial-expirado` ✓
- Página `app.trial-expirado.tsx` existe e leva ao fluxo de planos ✓
- **Sem divergência funcional.**

### 1.3 Switcher de workspace

- `WorkspaceProvider.switchWorkspace()` persiste em `localStorage` e chama `qc.clear()`, forçando refetch de todas as queries com o novo `workspaceId` ✓
- Rotas usam `useWorkspace()` como key das queries ✓
- **Sem divergência.** (Observação menor: `qc.clear()` derruba caches globais também — aceitável, é o modo mais seguro contra vazamento entre tenants.)

### 1.4 Convite de membro (Equipe)

- `app.equipe.tsx` linha 68-74: função `invite()` **é um stub** — apenas mostra `toast.info("Convite por e-mail em preparação…")` e não cria nada. Não há tabela `workspace_invites`, não há token, não há envio de e-mail, não há aceite. O texto instrui o usuário a se cadastrar com o mesmo e-mail, mas isso na verdade cria um **workspace pessoal novo** (o trigger `handle_new_user` sempre cria um workspace próprio) e não adiciona ao workspace de origem.
- **Divergência confirmada:** convite por token + expiração **não existe**.

### 1.5 Outros achados menores

- `handle_new_user` faz `INSERT INTO public.subscriptions` diretamente — funciona porque o trigger é `SECURITY DEFINER`, mas a policy `subs_insert` está aberta (sem `WITH CHECK`). Hardening opcional.
- Rota `/app/pessoas` está listada em `MODULE_ACCESS` e no sidebar, mas o arquivo é `ComingSoon`. Não há tabela `contacts/pessoas` no schema.

---

## 2. Correções propostas (esforço + impacto)

Ordem por risco/impacto. Cada item é uma migração RLS pequena e cirúrgica; **nenhum ALTER TABLE, nenhuma quebra de contrato**. Espero sua aprovação antes de aplicar.

### Fix A — `agent_runs` cross-tenant (alto impacto, baixo esforço)
Nova migration ajustando as 4 policies para usar `is_workspace_member(auth.uid(), workspace_id)` (SELECT) e `is_workspace_admin(auth.uid(), workspace_id)` (UPDATE/DELETE) em vez do bypass por role global. `super_admin` continua com bypass via `is_super_admin`. Manter o dono (`created_by`) com acesso próprio.

### Fix B — `attachments` cross-tenant (alto impacto, baixo esforço)
Substituir a policy `ALL` única por SELECT/INSERT/UPDATE/DELETE explícitas, escopadas em `workspace_id`, seguindo o mesmo padrão de A.

### Fix C — `companies` UPDATE/DELETE (médio impacto, baixo esforço)
Trocar a base de autorização de "created_by ou admin global" para `is_workspace_admin(auth.uid(), workspace_id) OR created_by = auth.uid() OR is_super_admin(auth.uid())`. SELECT já está correto.

### Fix D — Hardening de `INSERT` policies (baixo impacto, baixo esforço)
Adicionar `WITH CHECK` a `subs_insert`, `ws_insert`, `wm_insert` (esta última já foi endurecida em migração anterior, revalidar), `companies auth insert` e `runs owner insert` para exigir consistência de `workspace_id`/`created_by` = usuário atual. Isso impede spoof direto pelo cliente.

### Fix E — Testes de RLS
Ampliar `tests/rls.test.ts` cobrindo os novos casos: usuário A não lê `agent_runs`/`attachments` de B; `admin` de A não escreve em `companies` de B.

### Fix F — Convite de membro por token (novo, decidir depois)
Requer:
- Tabela `workspace_invites` (workspace_id, email, role, token, invited_by, expires_at, accepted_at, status) + RLS.
- Server function que gera token e (opcionalmente) dispara e-mail via Lovable Cloud.
- Página `/app/invite/$token` que valida e insere em `workspace_members`.
- Ajuste em `handle_new_user` para respeitar convite pendente (não criar workspace pessoal se o cadastro veio de um invite).

**Este é o único item que muda estrutura.** Não farei sem seu OK explícito. Estimativa: 1 tabela + 1 migração + 2-3 arquivos de código.

---

## 3. Placeholders (ainda `ComingSoon`)

Precisam de conteúdo real quando você quiser priorizar:

- `/app/pessoas` — sem tabela no schema
- `/app/biblioteca` — sem tabela no schema
- `/app/academy` — sem tabela no schema
- `/app/relatorios` — sem agregações; poderia rodar sobre `agent_runs`/`companies`
- `/app/ajuda` — verificar se é conteúdo estático real ou stub

---

## 4. Escopo desta etapa

Se você aprovar, eu executo **A, B, C, D, E** (todos são hardening de RLS + testes; sem mudar tabelas, sem mudar enum de roles, sem mudar semântica workspaces↔companies) e paro. **F (convite por token)** e placeholders ficam para etapas seguintes, sob sua decisão.

Confirma seguir com A–E?