import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, Mail, Clock, Target, CheckCircle2, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLayout, PageMain } from "@/components/layout/PageLayout";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

const CANONICAL = "https://nsbflow.lovable.app/guias/follow-up-email-templates";

export const Route = createFileRoute("/guias/follow-up-email-templates")({
  head: () => ({
    meta: [
      { title: "Follow-up Email Templates: 12 Modelos B2B" },
      {
        name: "description",
        content:
          "Guia completo com 12 templates de follow-up email para vendas B2B: pós-reunião, proposta enviada, cliente sumido, renovação e mais. Copie, adapte e envie.",
      },
      { property: "og:title", content: "Follow-up Email Templates: 12 Modelos para Vendas B2B" },
      {
        property: "og:description",
        content:
          "12 templates prontos de follow-up email, cadências recomendadas e boas práticas para acelerar respostas em vendas B2B.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Follow-up Email Templates: 12 Modelos para Vendas B2B" },
      {
        name: "twitter:description",
        content:
          "12 templates prontos de follow-up email + cadências recomendadas para vendas B2B.",
      },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Follow-up Email Templates: 12 Modelos Prontos para Vendas B2B",
          description:
            "Guia completo com 12 templates de follow-up email para vendas B2B, cadências recomendadas e boas práticas.",
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
              name: "Quantos follow-ups devo enviar antes de desistir?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Uma cadência típica em vendas B2B tem entre 5 e 8 toques em 3 a 4 semanas, alternando e-mail, telefone e LinkedIn. Após o último toque, envie um breakup email e mova o lead para nutrição.",
              },
            },
            {
              "@type": "Question",
              name: "Qual o melhor horário para enviar follow-up?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Terças, quartas e quintas entre 9h–11h e 14h–16h no fuso do destinatário costumam ter as maiores taxas de abertura e resposta em vendas B2B.",
              },
            },
            {
              "@type": "Question",
              name: "Follow-up curto ou longo funciona melhor?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "E-mails de follow-up entre 50 e 125 palavras têm as maiores taxas de resposta. Vá direto ao ponto, referencie o contexto anterior e termine com uma pergunta específica.",
              },
            },
          ],
        }),
      },
    ],
  }),
  component: FollowUpGuide,
});

type Template = {
  id: string;
  title: string;
  when: string;
  subject: string;
  body: string;
};

const TEMPLATES: Template[] = [
  {
    id: "pos-reuniao",
    title: "1. Pós-reunião de descoberta",
    when: "Envie no mesmo dia, em até 2 horas após a call.",
    subject: "Resumo da nossa conversa + próximos passos",
    body: `Olá {{nome}},

Obrigado pelo tempo hoje. Como combinado, seguem os pontos que discutimos:

• Contexto atual: {{contexto}}
• Principal desafio: {{desafio}}
• Resultado desejado em 90 dias: {{resultado}}

Como próximo passo, sugiro {{proxima_acao}} até {{data}}. Faz sentido?

Abraço,
{{seu_nome}}`,
  },
  {
    id: "proposta-enviada",
    title: "2. Após envio de proposta",
    when: "48h após envio, se não houver retorno.",
    subject: "Alguma dúvida sobre a proposta, {{nome}}?",
    body: `Oi {{nome}},

Passando para saber se conseguiu revisar a proposta que enviei na {{dia_semana}}.

Se preferir, posso reservar 15 minutos para esclarecer qualquer ponto antes da sua decisão. Tenho janelas {{horario_1}} e {{horario_2}}.

Fico no aguardo,
{{seu_nome}}`,
  },
  {
    id: "sem-resposta-1",
    title: "3. Cliente sumido — 1º toque",
    when: "5 dias úteis sem resposta.",
    subject: "Ainda faz sentido conversar?",
    body: `Olá {{nome}},

Não recebi retorno sobre o próximo passo que combinamos. Entendo que a agenda pode estar corrida.

Você prefere:
1. Retomar agora com uma call de 15 min
2. Reagendar para daqui a 2 semanas
3. Pausar e retomar quando fizer mais sentido

Um "1", "2" ou "3" já me ajuda.

{{seu_nome}}`,
  },
  {
    id: "sem-resposta-2",
    title: "4. Breakup email (último toque)",
    when: "Após 3 a 4 tentativas sem resposta.",
    subject: "Posso encerrar esta thread?",
    body: `{{nome}},

Como não obtive retorno, vou assumir que não é o momento certo e encerrar o acompanhamento por aqui.

Se algo mudar em {{contexto_negocio}}, minha porta segue aberta — basta responder este e-mail.

Sucesso na jornada,
{{seu_nome}}`,
  },
  {
    id: "novo-tomador",
    title: "5. Novo tomador de decisão entrou",
    when: "Quando surge um novo stakeholder no processo.",
    subject: "Contexto rápido antes da nossa conversa",
    body: `Olá {{nome}},

Soube pelo {{referente}} que você passou a acompanhar o projeto de {{tema}}. Para ganharmos tempo, resumi em 3 pontos onde estamos:

1. {{ponto_1}}
2. {{ponto_2}}
3. {{ponto_3}}

Consigo 20 minutos na {{data}} para alinhar prioridades com você?

Abraço,
{{seu_nome}}`,
  },
  {
    id: "gatilho-conteudo",
    title: "6. Follow-up com gatilho de valor",
    when: "Quando há material relevante para o desafio do lead.",
    subject: "{{nome}}, isso me lembrou do seu caso",
    body: `Oi {{nome}},

Cruzei com {{recurso}} e me lembrei do desafio de {{desafio}} que você citou.

Destaquei os 2 trechos mais aplicáveis ao seu contexto: {{link}}.

Se fizer sentido, retomamos a conversa de {{tema}} na próxima semana?

{{seu_nome}}`,
  },
  {
    id: "pos-evento",
    title: "7. Pós-evento ou webinar",
    when: "Até 24h após o encontro.",
    subject: "Obrigado pela conversa no {{evento}}",
    body: `Olá {{nome}},

Foi ótimo trocar ideia no {{evento}}. Você comentou sobre {{tema}} — tenho um case bem próximo ao seu cenário.

Prefere que eu envie o material por aqui ou marcamos 20 minutos para discutir aplicado ao seu caso?

Abraço,
{{seu_nome}}`,
  },
  {
    id: "renovacao",
    title: "8. Renovação de contrato",
    when: "60 dias antes do vencimento.",
    subject: "Planejando os próximos 12 meses juntos",
    body: `Oi {{nome}},

Seu contrato renova em {{data_renovacao}}. Antes disso, gostaria de revisar com você:

• Resultados entregues no ciclo atual
• Metas para os próximos 12 meses
• Ajustes de escopo e investimento

Consigo 30 minutos na {{data}}. Confirmo?

{{seu_nome}}`,
  },
  {
    id: "upsell",
    title: "9. Upsell / expansão de conta",
    when: "Após um marco de sucesso do cliente.",
    subject: "Próximo salto para o time de {{area}}",
    body: `Olá {{nome}},

Com {{resultado_atingido}}, o time de {{area}} passa a ter um novo teto de crescimento.

Separei 3 movimentos que clientes similares fizeram nessa etapa: {{link}}.

Podemos discutir qual faz mais sentido para vocês? Tenho {{horario_1}} ou {{horario_2}}.

{{seu_nome}}`,
  },
  {
    id: "reengajamento",
    title: "10. Reengajamento de lead frio",
    when: "Lead sem interação há 60+ dias.",
    subject: "Vale reabrir a conversa, {{nome}}?",
    body: `Oi {{nome}},

Faz um tempo que não conversamos. De lá para cá, mudou bastante coisa em {{tema}} — inclusive {{novidade}}.

Se seu cenário mudou também, respondo com um resumo rápido. Se não, fico por aqui sem incomodar.

{{seu_nome}}`,
  },
  {
    id: "pedido-indicacao",
    title: "11. Pedido de indicação",
    when: "Após NPS positivo ou marco de sucesso.",
    subject: "Uma pergunta rápida, {{nome}}",
    body: `Olá {{nome}},

Fico feliz com o resultado que estamos construindo juntos.

Você conhece 1 ou 2 líderes que enfrentam {{desafio}} e gostariam de uma conversa? Pode ser uma apresentação curta por e-mail.

Obrigado desde já,
{{seu_nome}}`,
  },
  {
    id: "no-show",
    title: "12. No-show na reunião",
    when: "No mesmo dia, tom leve.",
    subject: "Perdi você hoje — remarcamos?",
    body: `Oi {{nome}},

Não consegui encontrar você na nossa call de hoje. Imagino que a agenda tenha apertado.

Reservei duas janelas para remarcar: {{horario_1}} e {{horario_2}}. Qual funciona melhor?

Abraço,
{{seu_nome}}`,
  },
];

const CADENCE = [
  { day: "Dia 0", channel: "E-mail", goal: "Contato inicial ou pós-call com resumo e CTA claro." },
  { day: "Dia 2", channel: "E-mail curto", goal: "Reforço com valor novo (case, conteúdo, dado)." },
  { day: "Dia 5", channel: "Telefone + LinkedIn", goal: "Tentativa multicanal, sem repetir o mesmo texto." },
  { day: "Dia 9", channel: "E-mail", goal: "Pergunta objetiva com opção 1/2/3." },
  { day: "Dia 14", channel: "E-mail", goal: "Gatilho externo: notícia do setor ou mudança relevante." },
  { day: "Dia 21", channel: "Breakup email", goal: "Encerrar a thread e liberar o CRM." },
];

const BEST_PRACTICES = [
  "Assuntos entre 30 e 50 caracteres, sem clickbait — a promessa deve caber no corpo.",
  "Um único CTA por e-mail: uma pergunta, uma ação, uma janela de horário.",
  "Personalização real nas primeiras 12 palavras — nome + contexto específico do lead.",
  "50 a 125 palavras no corpo. Textos longos derrubam a taxa de resposta.",
  "Assinatura enxuta: nome, cargo, empresa, um link. Sem banners pesados.",
  "Sempre responda na mesma thread — mantém histórico e melhora a entregabilidade.",
];

function FollowUpGuide() {
  return (
    <PageLayout>
      <MarketingHeader />

      <PageMain>
        <article className="max-w-4xl mx-auto px-6 py-12 lg:py-16">
          <div className="mb-10">
            <div className="text-sm text-muted-foreground mb-3">
              <Link to="/" className="hover:underline">
                NSB Flow
              </Link>{" "}
              / Guias / Follow-up Email Templates
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Follow-up Email Templates: 12 modelos prontos para vendas B2B
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-6">
              Um guia prático com 12 templates de follow-up email, cadência recomendada
              e boas práticas para aumentar sua taxa de resposta em vendas consultivas
              B2B. Copie, adapte às suas variáveis e envie.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <a
                  href="/downloads/nsb-flow-follow-up-email-templates.pdf"
                  download="NSB-Flow-Follow-up-Email-Templates.pdf"
                >
                  <Download className="w-4 h-4" />
                  Baixar guia em PDF
                </a>
              </Button>
              <span className="text-xs text-muted-foreground">
                PDF · 8 páginas · sem cadastro
              </span>
            </div>
          </div>


          <nav aria-label="Sumário" className="border rounded-xl p-5 mb-12 bg-muted/30">
            <div className="text-sm font-semibold mb-3">Neste guia</div>
            <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li><a href="#por-que" className="hover:text-foreground hover:underline">Por que follow-up é o maior alavancador de vendas</a></li>
              <li><a href="#cadencia" className="hover:text-foreground hover:underline">Cadência recomendada (21 dias)</a></li>
              <li><a href="#templates" className="hover:text-foreground hover:underline">12 templates prontos</a></li>
              <li><a href="#boas-praticas" className="hover:text-foreground hover:underline">Boas práticas de copywriting</a></li>
              <li><a href="#faq" className="hover:text-foreground hover:underline">Perguntas frequentes</a></li>
            </ol>
          </nav>

          <section id="por-que" className="mb-14 scroll-mt-20">
            <h2 className="text-2xl font-bold mb-4">Por que follow-up é o maior alavancador de vendas</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Segundo dados de mercado, 80% das vendas B2B exigem entre 5 e 12 toques
              para fechar, mas 44% dos vendedores desistem após o primeiro follow-up.
              Isso significa que times que sustentam uma cadência estruturada capturam
              a maior parte do pipeline que a concorrência abandona.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Mail, label: "5 a 8 toques", desc: "Cadência típica em B2B" },
                { icon: Clock, label: "21 dias", desc: "Janela recomendada" },
                { icon: Target, label: "50–125 palavras", desc: "Faixa com maior resposta" },
              ].map((item) => (
                <div key={item.label} className="border rounded-xl p-5">
                  <item.icon className="w-5 h-5 mb-3 text-primary" />
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-sm text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section id="cadencia" className="mb-14 scroll-mt-20">
            <h2 className="text-2xl font-bold mb-4">Cadência recomendada de 21 dias</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Estruture cada oportunidade em uma sequência multicanal. O objetivo é
              alternar formato e ângulo — não repetir o mesmo texto empurrando o lead.
            </p>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-semibold w-24">Dia</th>
                    <th className="text-left p-3 font-semibold w-40">Canal</th>
                    <th className="text-left p-3 font-semibold">Objetivo</th>
                  </tr>
                </thead>
                <tbody>
                  {CADENCE.map((row) => (
                    <tr key={row.day} className="border-t">
                      <td className="p-3 font-medium">{row.day}</td>
                      <td className="p-3 text-muted-foreground">{row.channel}</td>
                      <td className="p-3 text-muted-foreground">{row.goal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="templates" className="mb-14 scroll-mt-20">
            <h2 className="text-2xl font-bold mb-2">12 templates prontos</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Substitua as variáveis entre <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{`{{chaves}}`}</code>{" "}
              pelas informações reais do lead. Todas as versões estão em português para
              vendas B2B consultivas.
            </p>
            <div className="space-y-6">
              {TEMPLATES.map((t) => (
                <div key={t.id} id={t.id} className="border rounded-xl p-6 scroll-mt-20">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{t.title}</h3>
                      <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        {t.when}
                      </div>
                    </div>
                    <Copy className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                  <div className="text-sm mb-3">
                    <span className="text-muted-foreground">Assunto:</span>{" "}
                    <span className="font-medium">{t.subject}</span>
                  </div>
                  <pre className="text-sm bg-muted/40 rounded-lg p-4 whitespace-pre-wrap font-sans leading-relaxed">
                    {t.body}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          <section id="boas-praticas" className="mb-14 scroll-mt-20">
            <h2 className="text-2xl font-bold mb-4">Boas práticas de copywriting</h2>
            <ul className="space-y-3">
              {BEST_PRACTICES.map((tip) => (
                <li key={tip} className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="faq" className="mb-14 scroll-mt-20">
            <h2 className="text-2xl font-bold mb-6">Perguntas frequentes</h2>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Quantos follow-ups devo enviar antes de desistir?</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Uma cadência típica em vendas B2B tem entre 5 e 8 toques distribuídos
                  em 3 a 4 semanas, alternando e-mail, telefone e LinkedIn. Após o
                  último toque, envie um <em>breakup email</em> e mova o lead para
                  nutrição de longo prazo.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Qual o melhor horário para enviar follow-up?</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Terças, quartas e quintas entre 9h–11h e 14h–16h no fuso do
                  destinatário costumam ter as maiores taxas de abertura e resposta em
                  vendas B2B. Evite segundas cedo e sextas à tarde.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Follow-up curto ou longo funciona melhor?</h3>
                <p className="text-muted-foreground leading-relaxed">
                  E-mails entre 50 e 125 palavras têm as maiores taxas de resposta. Vá
                  direto ao ponto, referencie o contexto anterior e termine com uma
                  pergunta específica — nunca um "fico à disposição".
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Vale personalizar cada follow-up manualmente?</h3>
                <p className="text-muted-foreground leading-relaxed">
                  As primeiras 12 palavras devem ser sempre personalizadas: nome +
                  contexto específico do lead ou da conta. O restante do corpo pode vir
                  de um template consolidado.
                </p>
              </div>
            </div>
          </section>

          <section className="border rounded-2xl p-8 lg:p-10 bg-primary/5 border-primary/20">
            <h2 className="text-2xl font-bold mb-3">Gere follow-ups automáticos com o NSB Flow</h2>
            <p className="text-muted-foreground leading-relaxed mb-6 max-w-2xl">
              O módulo DEAP Meeting analisa suas reuniões e sugere o próximo follow-up
              com contexto real do lead — assunto, corpo e cadência prontos para envio.
            </p>
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Começar trial de 3 dias <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </section>
        </article>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} NSB Flow — Inteligência Comercial com DEAP Method™
      </footer>
    </div>
  );
}
