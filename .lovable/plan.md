
# NSB Flow — Plano do MVP

Plataforma SaaS enterprise para NSB. O Lovable cuida apenas de UI, dados, auth, uploads, histórico e PDF. Toda IA fica no n8n; a plataforma só consome webhook.

## 1. Escopo desta entrega

**Incluso (funcional ponta a ponta):**
- Autenticação (login, cadastro, esqueci-senha, perfil) + RBAC por 8 perfis
- Layout enterprise (sidebar colapsável, topbar, dark/light, PT-BR)
- Dashboard principal com widgets
- **DEAP Meeting** completo — Aba 1 (Briefing AI) e Aba 2 (Meeting Intelligence AI)
- Upload de áudio/vídeo/TXT/DOCX/PDF via Storage + URL assinada
- Agent Service universal (client + edge) → n8n
- Renderizador dinâmico de JSON (`metadata / summary / sections / scores / recommendations / attachments`)
- Histórico com pesquisa, filtros, favoritar, duplicar, editar, excluir, reexportar PDF
- Exportação de PDF corporativo (capa, índice, seções, rodapé)
- Configurações: URL do webhook n8n (placeholder configurável por admin)

**Shells navegáveis (stubs "em breve"):** DEAP Assessment, Empresas, Pessoas, Biblioteca, Academy, Relatórios, Ajuda. Prontos para receber novos agentes via Agent Service sem refatorar.

## 2. Identidade visual

- Paleta tokens (oklch em `src/styles.css`):
  - `--primary` Azul Marinho `#0A2540`
  - `--accent` Azul Royal `#2563EB`
  - `--gold` `#C9A24B` (apenas detalhes: badges premium, divisórias de capa PDF)
  - Neutros: branco premium, cinza claro
- Dark mode espelhado
- Tipografia: **Outfit** (display/headings) + **Inter** (body), via `@fontsource`
- Cards com sombra suave, cantos 12px, muito whitespace, micro-animações (framer-motion) discretas
- Ícones: lucide-react

## 3. Arquitetura

```
src/routes/
  __root.tsx                     shell + providers + theme
  index.tsx                      landing → redireciona /auth ou /app
  auth.tsx                       login/cadastro/reset (tabs)
  _authenticated/
    route.tsx                    (gerenciado — gate Supabase)
    app.tsx                      layout com Sidebar + Topbar
    app.index.tsx                Dashboard
    app.deap-meeting.tsx         Módulo Meeting (tabs: briefing | intelligence)
    app.historico.tsx            Histórico universal
    app.historico.$id.tsx        Detalhe/reexport
    app.configuracoes.tsx        Perfil, tema, webhook n8n (admin)
    app.deap-assessment.tsx      Shell
    app.empresas.tsx | pessoas | biblioteca | academy | relatorios | ajuda   Shells
  api/agent.ts                   Server route: proxy assinado → n8n
```

**Agent Service** (`src/lib/agent-service.ts`, chamado via `createServerFn`):
- Um único método `runAgent({ agent, payload })`
- Server function autenticada faz POST ao webhook n8n (URL vinda de secret ou config), grava execução na tabela `agent_runs`, retorna o JSON normalizado
- Qualquer agente novo (assessment, etc.) usa a mesma função — só muda `agent` no payload

**Renderizador dinâmico** (`src/components/agent-report/`):
- `<AgentReport data={json} />` percorre `sections[]` e escolhe componente por `type` (`kpi-grid`, `card-list`, `table`, `stakeholder-map`, `score`, `timeline`, `bullets`, `quote`, `objections`)
- Fallback genérico para tipos desconhecidos → nunca quebra com JSON futuro

## 4. Banco de dados (Lovable Cloud)

Tabelas com RLS + GRANTs + `has_role()`:

- `profiles` (id, full_name, avatar_url, sector)
- `app_role` enum: admin, ceo, diretor, gerente, coordenador, vendedor, consultor, sdr
- `user_roles` (user_id, role) + função `has_role(uuid, app_role)` security definer
- `companies` (razao_social, cnpj, created_by)
- `agent_runs` (id, agent, company_id, payload jsonb, result jsonb, status, score, favorite bool, tags[], created_by, created_at)
- `attachments` (run_id, path, mime, size, kind)
- `settings` (key/value — webhook_url, etc; admin-only)
- `notifications`, `activity_logs`

Storage: bucket privado `agent-uploads`, URLs assinadas de 24h enviadas ao n8n.

## 5. DEAP Meeting

**Aba 1 — Briefing AI:** form (razão social, CNPJ, objetivo, soluções multi-select, setor) → `runAgent({agent:'briefing', payload})` → renderiza seções pedidas (Resumo Executivo, Inteligência de Mercado, Concorrentes, Dores, Oportunidades, Stakeholders, Matriz Potencial, Estratégia, Perguntas, Objeções, Plano/Roteiro).

**Aba 2 — Meeting Intelligence AI:** mesmos campos + upload drag-and-drop com progresso → Storage → `runAgent({agent:'meeting', payload:{...,attachment_url}})` → renderiza (Resumo, Ata, Qualidade, Objetivos, Necessidades, Aderência, Oportunidades Perdidas, Objeções, Concorrentes, Próximos Passos, Follow-up, Sales Coach, Meeting Score, Plano próxima reunião).

Ações comuns: Salvar / Editar / Duplicar / Favoritar / Compartilhar / Exportar PDF.

## 6. PDF corporativo

Gerado client-side com **@react-pdf/renderer**:
- Capa: logo NSB (wordmark), nome empresa, cliente, tipo, data
- Índice automático
- Seções tipografadas (não é print da tela) — mesmo esquema do renderer, adaptado a componentes PDF
- Rodapé: "NSB Flow · DEAP Method™ · Confidencial · {data} · pág X/Y"
- Detalhes em dourado

## 7. Perfis & permissões

Menu e ações filtradas por `has_role`. MVP: admin vê tudo; vendedor/consultor/SDR veem DEAP Meeting + Dashboard + Histórico próprio; demais papéis veem também Relatórios. Regras finais configuráveis em código central `src/lib/permissions.ts`.

## 8. Integração n8n

- Admin cadastra URL em Configurações → salva na tabela `settings` (server-only fetch)
- Se URL ausente, UI mostra estado "Configurar webhook" ao invés de erro
- Enquanto n8n não responde: skeleton loader + timeout amigável 90s
- Estrutura JSON assumida:
```json
{ "metadata":{}, "summary":{}, "sections":[], "scores":{}, "recommendations":{}, "attachments":{} }
```

## 9. Detalhes técnicos

- TanStack Start + TanStack Query + Supabase (Lovable Cloud)
- shadcn/ui + Tailwind v4 tokens semânticos (nada de `text-white` hardcoded)
- Uploads via `supabase.storage` direto do browser com signed URL para n8n
- Todas server fns protegidas com `requireSupabaseAuth`
- Server route `/api/public/n8n-callback` (opcional futuro) para n8n empurrar resultados assíncronos — não implementado no MVP mas espaço reservado

## 10. Fora deste MVP (próximas iterações)

DEAP Assessment completo, CRM de Empresas/Pessoas, Biblioteca, Academy, Relatórios avançados com BI, notificações realtime, compartilhamento público de relatório, i18n. Todos entrarão via mesma arquitetura (novo `agent` string + seções JSON adicionais no renderer).

---

Ao aprovar, ativo o Lovable Cloud, crio schema + storage, instalo dependências (`@fontsource/outfit`, `@fontsource/inter`, `@react-pdf/renderer`, `framer-motion`, `react-dropzone`) e construo o MVP acima.
