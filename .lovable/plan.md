# NSB Flow — Módulo Billing, Planos, Trial, Workspaces & Logo Oficial

Complemento ao MVP existente. **Não altera** a arquitetura atual (Agent Service, DEAP Meeting, PDF, renderer dinâmico). Adiciona camadas de RBAC + Feature Flags + Multi-tenant.

---

## 1. Logo oficial NSB (quick win)

- Copiar `user-uploads://Photo_Perfil_-_NSB.png` para `src/assets/nsb-logo.png` (via `lovable-assets` para virar CDN).
- Substituir wordmark tipográfico em `src/components/brand/NsbLogo.tsx` pela imagem oficial (variantes: `collapsed` mostra apenas o quadrado; `full` mostra logo + tagline).
- Atualizar capa do PDF (`src/lib/pdf-report.tsx`) para usar a imagem via `<Image src="...">` do `@react-pdf/renderer`.
- Ajustar favicon (`public/favicon.png` + `__root.tsx` links) e OG image.

---

## 2. Modelo de dados (Lovable Cloud / Supabase)

Nova migração — **não mexe** nas tabelas existentes exceto adicionar coluna `workspace_id`.

### Enums novos
- `app_role`: adicionar `super_admin`, `admin_empresa`, `cliente` (mantém os 8 já existentes).
- `plan_tier`: `smart` | `pro` | `enterprise`.
- `subscription_status`: `trialing` | `active` | `past_due` | `canceled` | `expired`.
- `billing_cycle`: `monthly` | `yearly`.
- `payment_provider`: `stripe` | `mercadopago` | `asaas` | `pagseguro` | `manual`.

### Tabelas novas
| Tabela | Campos-chave |
|---|---|
| `workspaces` | id, name, slug, owner_user_id, logo_url, created_at |
| `workspace_members` | workspace_id, user_id, role (app_role), invited_by, joined_at, active |
| `plans` | id, tier, name, description, price_monthly_cents, price_yearly_cents, max_users (null=∞), features jsonb, active, sort_order |
| `plan_features` | plan_id, feature_key (ex: `deap.meeting`, `deap.assessment.leadership`, `pdf.export`, `dashboard.executive`), enabled, quota (null=∞) |
| `subscriptions` | id, workspace_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start, current_period_end, provider, provider_customer_id, provider_subscription_id, seats, cancel_at_period_end |
| `subscription_invoices` | id, subscription_id, amount_cents, currency, status, paid_at, provider_invoice_id, pdf_url |
| `enterprise_module_grants` | subscription_id, feature_key, enabled (override customizado do Enterprise) |
| `coupons` | code, percent_off, amount_off_cents, valid_until, max_redemptions, redeemed_count |

### Alterações em tabelas existentes
- `agent_runs`, `attachments`, `companies`, `profiles`: adicionar `workspace_id uuid` (nullable no início; backfill = workspace pessoal do owner).
- `user_roles`: adicionar `workspace_id uuid` (roles passam a ser por workspace).

### RLS
- Todas as tabelas de dados: policies `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND active)`.
- `super_admin`: bypass via função `is_super_admin(auth.uid())`.
- Trigger `handle_new_user` atualizado: cria workspace pessoal + membership `admin_empresa` + subscription `trialing` (3 dias, plano SMART) automaticamente.

### GRANTs — obrigatórios em toda tabela nova (authenticated + service_role).

---

## 3. Camada de permissões (RBAC + Feature Flags)

Arquivo novo `src/lib/entitlements.ts`:
- `FEATURE_KEYS` = catálogo central (`deap.meeting.briefing`, `deap.meeting.intelligence`, `deap.assessment.sales`, `deap.assessment.leadership`, `deap.assessment.process`, `deap.assessment.executive`, `dashboard.executive`, `reports`, `pdf.export`, `history`, `workspace.admin`, `platform.admin`).
- `useEntitlements()` hook: lê subscription + plan_features + enterprise_module_grants do workspace ativo → retorna `{ has(feature), quotaOf(feature), seatsUsed, seatsTotal, planTier, trialDaysLeft, isTrialExpired }`.
- `<FeatureGate feature="...">` component: renderiza children ou fallback (upgrade CTA).
- `roles.ts` estendido: mapa role → array de features **complementar** ao plano (plano define o teto; role define o subset dentro do workspace).

Sidebar (`AppSidebar.tsx`) e rotas passam a filtrar por `has(feature)` **além** de `canAccess(role, module)`.

---

## 4. Workspaces multi-tenant

- **Workspace Switcher** no topo do sidebar (dropdown estilo Slack): lista workspaces do usuário + "Criar novo workspace" + "Convidar para workspace".
- Contexto React `WorkspaceProvider` guarda `activeWorkspaceId` (persistido em localStorage + validado no server).
- Todas as queries do frontend passam `workspace_id` implícito via RLS (usuário só vê o que pertence ao workspace ativo).
- Trocar workspace = `router.invalidate()` + `queryClient.clear()`.

---

## 5. Trial de 3 dias

- Ao criar conta: trigger cria subscription `status='trialing'`, `plan=smart`, `trial_ends_at = now() + 3 days`.
- `useEntitlements` calcula `isTrialExpired` e `trialDaysLeft`.
- Banner global (`<TrialBanner />` no `_authenticated/app.tsx`): "Faltam X dias no seu teste. [Escolher Plano]".
- Quando expira: middleware de rota redireciona todas as rotas de agentes para `/app/planos` com tela elegante "Seu teste expirou".

---

## 6. Novas rotas

```
src/routes/_authenticated/
  app.planos.tsx              → tabela comparativa dos 3 planos + CTA
  app.checkout.tsx            → resumo + ciclo + cupom + método (placeholder gateway)
  app.assinatura.tsx          → Minha Assinatura (plano, licenças, histórico, upgrade/cancelar)
  app.equipe.tsx              → Gestão de Usuários do workspace (admin_empresa)
  app.workspaces.tsx          → Listar/criar workspaces
  app.trial-expirado.tsx      → Tela de bloqueio pós-trial
  admin/                      → subtree exclusivo super_admin
    admin.index.tsx           → dashboard global (# empresas, MRR, churn)
    admin.empresas.tsx        → todas as empresas
    admin.usuarios.tsx        → todos os usuários
    admin.assinaturas.tsx     → todas as subscriptions
    admin.planos.tsx          → CRUD de planos e features
```

Gate `beforeLoad` em `/admin/*`: `has_role(super_admin)` senão redirect.

---

## 7. Checkout e integração de pagamentos

**MVP**: gateway = `manual` (sem cobrança real). Arquitetura pronta para plugar.

- `src/lib/payment-providers/` — interface `PaymentProvider { createCheckoutSession, createPortalSession, handleWebhook }`.
- Implementações stub: `stripe.ts`, `mercadopago.ts`, `asaas.ts`, `pagseguro.ts` (assinatura pronta, corpo com `throw new Error("Configure API keys")`).
- Server function `createCheckoutFn` escolhe provider conforme `settings.payment_provider`.
- Webhook público em `src/routes/api/public/billing.webhook.$provider.tsx` — verifica assinatura HMAC do provider, atualiza `subscriptions`, insere `subscription_invoices`.
- Tela checkout: seletor mensal/anual (economia ~17%), campo cupom, resumo, botão "Assinar" → chama server fn → redireciona pra URL do provider (ou tela de confirmação no modo manual).

Setup real de gateway: apenas o admin insere keys em `/app/configuracoes` depois. Nada codificado.

---

## 8. Planos comerciais (seed via migration)

| Plano | Preço mensal (BRL) | Anual | Seats | Features |
|---|---|---|---|---|
| SMART | 197 | 1970 | 1 | meeting.briefing, meeting.intelligence, history, pdf.export |
| PRO | 697 | 6970 | 5 | tudo do SMART + assessment.* (4 agentes) + dashboard.executive + reports |
| ENTERPRISE | sob consulta | — | configurável | tudo, com `enterprise_module_grants` liberando features à la carte |

Valores placeholder — admin edita depois em `/admin/planos`.

---

## 9. Super Admin & Admin Empresa

- `super_admin` (proprietário NSB): acesso ao subtree `/admin/*` — vê tudo, RLS via função `is_super_admin`.
- `admin_empresa` (dentro do workspace): rota `/app/equipe` — convida, remove, altera role de membros, vê consumo de licenças.
- Convite: e-mail (`equipe.convidar` server fn) gera link com token → cria `workspace_members` ao aceitar.

---

## 10. Tela "Meus Planos" (design)

Layout inspirado em Stripe/Notion:
- Hero premium (navy + gold): "Escolha seu plano NSB Flow".
- 3 cards lado a lado, PRO destacado com badge "Mais popular".
- Toggle Mensal/Anual (mostra economia).
- Tabela comparativa abaixo (checkmarks gold).
- Enterprise: card final full-width com "Falar com Especialista" → mailto ou form.
- Micro-animações framer-motion (fade-in staggered).

---

## 11. Ordem de implementação (1 sessão, sequencial)

1. Migração SQL (enums, tabelas, RLS, seed dos 3 planos, trigger atualizado).
2. Logo oficial + PDF + favicon.
3. `entitlements.ts` + `WorkspaceProvider` + workspace switcher.
4. Trial banner + tela expirada + gate de rotas.
5. Rotas de planos, checkout, assinatura, equipe.
6. Subtree `/admin/*` (super admin).
7. Stubs de payment providers + webhook route.
8. Ajustar Sidebar e rotas existentes pra respeitar `has(feature)`.

---

## Fora deste PR (próximas iterações)
- Integração real com gateways (chaves e homologação por provider).
- E-mail transacional de convite/cobrança.
- Faturas em PDF.
- Portal de billing self-service completo (proração).
- Analytics avançado no dashboard super-admin.

---

**Nenhuma alteração no motor de agentes, no renderer dinâmico ou no fluxo de execução do n8n.** Toda a nova camada é ortogonal.

Confirma para eu implementar tudo isso na sequência?
