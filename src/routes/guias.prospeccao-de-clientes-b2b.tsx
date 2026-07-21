import { createFileRoute, Link } from "@tanstack/react-router";
import { Target, Users, Search, MessageSquare, TrendingUp, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLayout, PageMain } from "@/components/layout/PageLayout";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

const CANONICAL = "https://nsbflow.lovable.app/guias/prospeccao-de-clientes-b2b";

export const Route = createFileRoute("/guias/prospeccao-de-clientes-b2b")({
  head: () => ({
    meta: [
      { title: "Prospecção de Clientes B2B: Guia Definitivo" },
      {
        name: "description",
        content:
          "Como fazer prospecção de clientes B2B: ICP, listas, cadências multicanal, scripts de abordagem e métricas para gerar reuniões qualificadas.",
      },
      { property: "og:title", content: "Prospecção de Clientes B2B: Guia Definitivo" },
      {
        property: "og:description",
        content:
          "Método completo de prospecção B2B: ICP, listas, cadências multicanal, scripts e métricas para gerar reuniões qualificadas.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Prospecção de Clientes B2B: Guia Definitivo" },
      {
        name: "twitter:description",
        content: "ICP, listas, cadências multicanal e scripts para prospecção B2B qualificada.",
      },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Como fazer prospecção de clientes B2B: O Guia Definitivo",
          description:
            "Método completo de prospecção B2B com foco em ICP, listas, cadências multicanal, scripts e métricas.",
          author: { "@type": "Organization", name: "NSB Flow" },
          publisher: { "@type": "Organization", name: "NSB Flow" },
          mainEntityOfPage: CANONICAL,
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "O que é prospecção de clientes B2B?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "É o processo estruturado de identificar empresas dentro do seu ICP, mapear tomadores de decisão e iniciar conversas comerciais qualificadas por e-mail, telefone e LinkedIn, com o objetivo de gerar reuniões e oportunidades de venda.",
              },
            },
            {
              "@type": "Question",
              name: "Quantos contatos preciso para gerar uma reunião B2B?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Em vendas B2B consultivas, a média de mercado exige de 80 a 150 contatos únicos e 5 a 8 toques em cadência multicanal para gerar uma reunião qualificada. Times bem treinados operando com ICP restrito reduzem esse número para 40–60 contatos.",
              },
            },
            {
              "@type": "Question",
              name: "Qual a diferença entre outbound e inbound B2B?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Outbound é a prospecção ativa: você identifica o cliente ideal e inicia o contato. Inbound é a atração passiva por conteúdo, SEO e mídia. Em vendas complexas B2B, os dois se complementam — outbound acelera pipeline no curto prazo, inbound reduz o custo de aquisição no longo prazo.",
              },
            },
            {
              "@type": "Question",
              name: "Qual o melhor canal para prospecção B2B em 2026?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Nenhum canal isolado bate uma cadência multicanal bem executada. E-mail escala volume, LinkedIn abre porta com contexto e telefone converte com velocidade. A regra prática é alternar os três em uma cadência de 15 a 21 dias.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: Guide,
});

const STEPS = [
  { icon: Target, title: "Defina o ICP", desc: "Perfil de Cliente Ideal: setor, porte, receita, região, sinais de compra e maturidade digital." },
  { icon: Search, title: "Construa a lista", desc: "Fontes: LinkedIn Sales Navigator, Apollo, Cognism, RD Station, dados públicos e enriquecimento com CNPJ." },
  { icon: Users, title: "Mapeie stakeholders", desc: "Decisor, influenciador, usuário e financeiro. Prospecção multi-thread aumenta a taxa de resposta em 3x." },
  { icon: MessageSquare, title: "Execute a cadência", desc: "5 a 8 toques em 15–21 dias, alternando e-mail, LinkedIn e telefone com mensagem contextualizada." },
  { icon: TrendingUp, title: "Meça e otimize", desc: "Taxa de resposta, positivas, no-show, conversão em oportunidade. Ajuste ICP, canal ou copy semanalmente." },
];

const SCRIPTS: { channel: string; title: string; body: string }[] = [
  {
    channel: "LinkedIn — Connection Note",
    title: "Abertura com contexto (300 caracteres)",
    body: `Olá {{nome}}, vi que a {{empresa}} está {{sinal_gatilho}} — tenho ajudado times de {{cargo}} em {{setor}} a {{resultado}}. Faz sentido trocar ideias em 15min?`,
  },
  {
    channel: "E-mail — 1º toque frio",
    title: "Cold email consultivo (aberto → resposta)",
    body: `Assunto: {{empresa}} + {{tema_relevante}}

{{nome}}, boa {{periodo}}.

Estou acompanhando {{empresa}} e vi {{sinal_gatilho}}. Times de {{cargo}} em {{setor}} têm buscado {{resultado}} — geralmente o gargalo está em {{dor_hipotese}}.

Faz sentido reservar 15 minutos na {{data_1}} ou {{data_2}} para trocar ideias, mesmo que não vire projeto agora?

{{seu_nome}}`,
  },
  {
    channel: "Telefone — Script de abertura",
    title: "Cold call de 30 segundos (permission-based)",
    body: `"{{nome}}, aqui é {{seu_nome}} da {{sua_empresa}}. Sei que liguei sem agendar — me dá 30 segundos para eu explicar o motivo e você decide se faz sentido continuar?

O motivo é: {{dor_hipotese}} — vi que {{sinal_gatilho}} na {{empresa}} e ajudamos {{cliente_similar}} a {{resultado}}. Faz sentido reservarmos 20 minutos essa semana?"`,
  },
  {
    channel: "LinkedIn — Follow-up",
    title: "Reengajamento sem resposta (dia 7)",
    body: `Oi {{nome}}, tudo bem? Vi que minha mensagem passou batida — normal, imagino a agenda. 

Só um contexto rápido: ajudamos {{cliente_similar}} a {{resultado}} em {{prazo}}. Se {{dor_hipotese}} for prioridade em {{empresa}}, dá para eu enviar um resumo de 2 páginas de como pensamos o problema?`,
  },
  {
    channel: "E-mail — Breakup",
    title: "Último toque (dia 21)",
    body: `Assunto: Posso encerrar esta thread, {{nome}}?

{{nome}},

Como não obtive retorno, vou assumir que não é o momento certo e encerrar aqui. Se {{dor_hipotese}} voltar ao radar em {{empresa}}, minha porta segue aberta — basta responder este e-mail.

Sucesso na jornada,
{{seu_nome}}`,
  },
];

const METRICS = [
  { label: "Contatos por reunião", value: "40–150", note: "ICP restrito reduz; ICP largo aumenta." },
  { label: "Taxa de resposta", value: "8–15%", note: "Cadência multicanal bem feita." },
  { label: "Reuniões → Oportunidade", value: "30–50%", note: "Depende da qualificação BANT/MEDDIC." },
  { label: "Oportunidade → Fechamento", value: "15–30%", note: "Enterprise B2B consultivo." },
];

function Guide() {
  return (
    <PageLayout>
      <MarketingHeader ctaLabel="Testar grátis" sticky={false} />

      <PageMain>
        <article className="max-w-4xl mx-auto px-6 py-12 lg:py-16">
          <div className="mb-10">
            <div className="text-sm text-muted-foreground mb-3">
              <Link to="/" className="hover:underline">NSB Flow</Link> / Guias / Prospecção de Clientes B2B
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Como fazer prospecção de clientes B2B: O Guia Definitivo
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Um método prático de prospecção B2B baseado no DEAP Method™ — do ICP à cadência
              multicanal, passando por scripts prontos e métricas de referência para gerar
              reuniões qualificadas de forma previsível.
            </p>
          </div>

          <nav aria-label="Sumário" className="border rounded-xl p-5 mb-12 bg-muted/30">
            <div className="text-sm font-semibold mb-3">Neste guia</div>
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li><a href="#o-que-e" className="hover:text-foreground hover:underline">O que é prospecção B2B e por que ela mudou</a></li>
              <li><a href="#metodo" className="hover:text-foreground hover:underline">O método NSB em 5 passos</a></li>
              <li><a href="#icp" className="hover:text-foreground hover:underline">Como definir o ICP (Perfil de Cliente Ideal)</a></li>
              <li><a href="#lista" className="hover:text-foreground hover:underline">Construção da lista e enriquecimento</a></li>
              <li><a href="#cadencia" className="hover:text-foreground hover:underline">Cadência multicanal de 21 dias</a></li>
              <li><a href="#scripts" className="hover:text-foreground hover:underline">Scripts prontos: LinkedIn, e-mail e telefone</a></li>
              <li><a href="#metricas" className="hover:text-foreground hover:underline">Métricas de referência</a></li>
              <li><a href="#erros" className="hover:text-foreground hover:underline">Erros que matam a prospecção</a></li>
            </ol>
          </nav>

          <section id="o-que-e" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">O que é prospecção B2B e por que ela mudou</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Prospecção de clientes B2B é o processo ativo de identificar empresas alinhadas ao
              seu ICP, mapear tomadores de decisão e iniciar conversas comerciais qualificadas.
              Historicamente ela era medida em volume — ligações, e-mails e cadastros em CRM.
              Em 2026, o jogo é outro: <strong>contexto vale mais que volume</strong>.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Decisores B2B recebem entre 100 e 300 mensagens comerciais por semana. A regra
              prática atual é simples: ou sua mensagem carrega um sinal claro sobre o negócio
              do prospect, ou ela vai para a pasta de arquivo em segundos. É por isso que o
              método NSB combina inteligência de conta (briefing) com cadência disciplinada.
            </p>
          </section>

          <section id="metodo" className="mb-14">
            <h2 className="text-2xl font-bold mb-6">O método NSB em 5 passos</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {STEPS.map((s) => (
                <div key={s.title} className="border rounded-xl p-5 bg-card">
                  <s.icon className="w-5 h-5 text-primary mb-3" />
                  <h3 className="font-semibold mb-1.5">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="icp" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">Como definir o ICP (Perfil de Cliente Ideal)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Um ICP mal definido é a causa número um de baixa produtividade em prospecção. O
              time gasta 80% do tempo em contas que nunca fechariam. Um ICP bem definido responde
              7 perguntas com precisão:
            </p>
            <ul className="space-y-2 mb-4">
              {[
                "Setor e sub-setor (ex.: SaaS B2B, não apenas “tecnologia”)",
                "Porte por receita e por headcount",
                "Localização e complexidade regulatória",
                "Maturidade digital e stack tecnológico",
                "Estrutura de decisão (comitê, dono, C-level)",
                "Sinais de compra (contratação recente, funding, expansão, troca de liderança)",
                "Dor primária que seu produto resolve melhor que qualquer alternativa",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground leading-relaxed">
              Regra de bolso: se o seu ICP couber em menos de 200 empresas, ele está bem restrito.
              Se passar de 2.000, provavelmente precisa ser recortado.
            </p>
          </section>

          <section id="lista" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">Construção da lista e enriquecimento</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              A lista é o ativo comercial mais subestimado do time B2B. Uma lista limpa,
              enriquecida e priorizada por sinais de compra rende 3 a 5x mais reuniões que uma
              lista comprada e não tratada.
            </p>
            <div className="border rounded-xl p-5 bg-muted/30">
              <div className="text-sm font-semibold mb-2">Stack recomendado</div>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>• <strong>Descoberta:</strong> LinkedIn Sales Navigator, Apollo, Cognism, Lusha.</li>
                <li>• <strong>Enriquecimento:</strong> Clearbit, Serasa Experian (BR), dados públicos de CNPJ.</li>
                <li>• <strong>Sinais de compra:</strong> vagas abertas, funding, notícias, mudança de C-level.</li>
                <li>• <strong>Higienização:</strong> validação de e-mails (NeverBounce, ZeroBounce) antes de disparar.</li>
              </ul>
            </div>
          </section>

          <section id="cadencia" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">Cadência multicanal de 21 dias</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Cadência é a sequência disciplinada de toques em canais diferentes. Uma cadência
              típica B2B tem entre 5 e 8 toques em 21 dias, alternando e-mail, LinkedIn e
              telefone. Abaixo, a estrutura que usamos no DEAP Method™:
            </p>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Dia</th>
                    <th className="px-4 py-3 font-semibold">Canal</th>
                    <th className="px-4 py-3 font-semibold">Objetivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    ["Dia 1", "LinkedIn (connection note)", "Abrir porta com contexto"],
                    ["Dia 2", "E-mail frio", "Apresentar hipótese de dor"],
                    ["Dia 5", "Telefone", "Conversa curta permission-based"],
                    ["Dia 8", "LinkedIn (mensagem)", "Reforçar valor com case"],
                    ["Dia 12", "E-mail (case study)", "Prova social + CTA suave"],
                    ["Dia 16", "Telefone + voicemail", "Última tentativa ativa"],
                    ["Dia 21", "E-mail breakup", "Encerrar thread e liberar mental"],
                  ].map((row) => (
                    <tr key={row[0]}>
                      <td className="px-4 py-3 font-medium">{row[0]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="scripts" className="mb-14">
            <h2 className="text-2xl font-bold mb-6">Scripts prontos: LinkedIn, e-mail e telefone</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Substitua as variáveis entre <code className="text-xs bg-muted px-1 py-0.5 rounded">{`{{chaves}}`}</code> pelas
              informações reais do prospect. Personalize sempre pelo menos <strong>sinal_gatilho</strong> e{" "}
              <strong>dor_hipotese</strong> — são os dois campos que diferenciam sua mensagem do spam.
            </p>
            <div className="space-y-6">
              {SCRIPTS.map((s) => (
                <div key={s.title} className="border-l-4 border-primary rounded-r-xl bg-muted/30 p-5">
                  <div className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">{s.channel}</div>
                  <div className="font-semibold mb-3">{s.title}</div>
                  <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                    {s.body}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          <section id="metricas" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">Métricas de referência</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Se você não mede, não melhora. As faixas abaixo são benchmarks de mercado para
              vendas B2B consultivas — use como termômetro, não como meta rígida.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {METRICS.map((m) => (
                <div key={m.label} className="border rounded-xl p-5">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{m.label}</div>
                  <div className="text-3xl font-bold text-primary mb-1">{m.value}</div>
                  <div className="text-xs text-muted-foreground">{m.note}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="erros" className="mb-14">
            <h2 className="text-2xl font-bold mb-4">Erros que matam a prospecção</h2>
            <ul className="space-y-3">
              {[
                { t: "ICP amplo demais", d: "Prospectar “empresas de médio porte” é o mesmo que não ter ICP. Recorte por setor, dor e sinal." },
                { t: "Só um canal", d: "E-mail sozinho converte 3x menos que uma cadência multicanal com LinkedIn e telefone." },
                { t: "Mensagem sobre você", d: "Se o primeiro parágrafo fala da sua empresa, o prospect fecha. Comece pelo negócio dele." },
                { t: "Sem breakup", d: "Sem o e-mail de encerramento, threads morrem e ocupam mental. O breakup libera pipeline e às vezes reabre a conversa." },
                { t: "Não medir", d: "Sem taxa de resposta, positivas e no-show, você não sabe se o problema é lista, canal ou copy." },
              ].map((e) => (
                <li key={e.t} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0 text-xs font-bold">!</div>
                  <div>
                    <div className="font-semibold">{e.t}</div>
                    <div className="text-sm text-muted-foreground">{e.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="border rounded-2xl p-8 bg-primary text-primary-foreground">
            <h2 className="text-2xl font-bold mb-3">Do briefing à reunião — em um só lugar</h2>
            <p className="opacity-90 mb-6 leading-relaxed">
              O NSB Flow entrega o briefing executivo da conta antes de cada abordagem e a
              análise automática de cada reunião depois dela. Prospecção com contexto,
              qualificação com método.
            </p>
            <Button asChild size="lg" variant="secondary" className="gap-2">
              <Link to="/auth" search={{ mode: "signup" }}>
                Testar 3 dias grátis <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </section>
        </article>
      </main>

      <footer className="border-t py-6 px-6 text-xs text-muted-foreground flex items-center justify-between">
        <span>© {new Date().getFullYear()} NSB · Growth by Method</span>
        <span>DEAP Method™ · Confidencial</span>
      </footer>
    </div>
  );
}
