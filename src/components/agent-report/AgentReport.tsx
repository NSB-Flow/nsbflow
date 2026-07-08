/**
 * Renderizador dinâmico de resultado JSON de qualquer agente.
 *
 * Forma esperada (flexível):
 * {
 *   metadata?: {},
 *   summary?: string | { text, highlights[] } | Record<string,string>,
 *   sections?: Array<{ id?, title, type?, content? } | any>,
 *   scores?: { key: label|number|{value,max,label?} } | Array<...>,
 *   recommendations?: string[] | Array<{title, description?}>,
 *   attachments?: any
 * }
 *
 * Nunca assume estrutura fixa: tudo é opcional e há fallbacks.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

type Json = unknown;

interface Props {
  data: Json;
  className?: string;
}

export function AgentReport({ data, className }: Props) {
  if (!data || typeof data !== "object") {
    return <EmptyReport />;
  }
  const d = data as Record<string, Json>;
  const summary = d.summary ?? d.resumo ?? null;
  const sections = (d.sections ?? d.secoes ?? []) as Json[];
  const scores = d.scores ?? d.pontuacoes ?? null;
  const recommendations = d.recommendations ?? d.recomendacoes ?? null;
  const metadata = d.metadata as Record<string, Json> | undefined;

  return (
    <div className={cn("space-y-6", className)}>
      {metadata && Object.keys(metadata).length > 0 && <MetadataBar meta={metadata} />}
      {summary != null && <SummaryCard summary={summary} />}
      {scores != null && <ScoresBlock scores={scores} />}
      {Array.isArray(sections) &&
        sections.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <SectionRenderer section={s} />
          </motion.div>
        ))}
      {recommendations != null && <RecommendationsBlock recs={recommendations} />}
    </div>
  );
}

function EmptyReport() {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Nenhum resultado ainda. Execute o agente para ver o relatório.
      </CardContent>
    </Card>
  );
}

function MetadataBar({ meta }: { meta: Record<string, Json> }) {
  const entries = Object.entries(meta).slice(0, 8);
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <Badge key={k} variant="secondary" className="font-normal">
          <span className="text-muted-foreground mr-1">{k}:</span>
          <span className="text-foreground">{stringifyShort(v)}</span>
        </Badge>
      ))}
    </div>
  );
}

function SummaryCard({ summary }: { summary: Json }) {
  return (
    <Card className="border-l-4 border-l-[var(--color-accent)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-display">Resumo Executivo</CardTitle>
      </CardHeader>
      <CardContent>
        <ValueRenderer value={summary} />
      </CardContent>
    </Card>
  );
}

function SectionRenderer({ section }: { section: Json }) {
  if (typeof section === "string") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm leading-relaxed">{section}</p>
        </CardContent>
      </Card>
    );
  }
  if (!section || typeof section !== "object") return null;
  const s = section as Record<string, Json>;
  const title = (s.title ?? s.titulo ?? s.name ?? "Seção") as string;
  const type = (s.type ?? s.tipo ?? "auto") as string;
  const content = s.content ?? s.conteudo ?? s.items ?? s.body ?? s;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-display">{title}</CardTitle>
          {type !== "auto" && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {type}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        <TypedContent type={type} content={content} />
      </CardContent>
    </Card>
  );
}

function TypedContent({ type, content }: { type: string; content: Json }) {
  if (type === "table" && Array.isArray(content)) return <TableRenderer rows={content} />;
  if (type === "bullets" || type === "list") return <BulletList items={coerceArray(content) as (string | number | Record<string, Json>)[]} />;
  if (type === "kpi-grid" || type === "kpis") return <KpiGrid items={coerceArray(content)} />;
  if (type === "quote" && typeof content === "string") return <Quote text={content} />;
  if (type === "objections") return <ObjectionsList items={coerceArray(content)} />;
  if (type === "stakeholders") return <StakeholderList items={coerceArray(content)} />;
  return <ValueRenderer value={content} />;
}

function ValueRenderer({ value }: { value: Json }) {
  if (value == null) return null;
  if (typeof value === "string") return <p className="whitespace-pre-line leading-relaxed">{value}</p>;
  if (typeof value === "number" || typeof value === "boolean")
    return <p>{String(value)}</p>;
  if (Array.isArray(value)) {
    // list of strings vs list of objects
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return <BulletList items={value as (string | number | Record<string, Json>)[]} />;
    }
    return (
      <div className="space-y-3">
        {value.map((v, i) => (
          <div key={i} className="rounded-md bg-muted/40 p-3">
            <ValueRenderer value={v} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, Json>);
    return (
      <div className="grid gap-3">
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
              {humanizeKey(k)}
            </div>
            <ValueRenderer value={v} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function BulletList({ items }: { items: (string | number | Record<string, Json>)[] }) {
  return (
    <ul className="space-y-1.5 list-disc pl-5">
      {items.map((it, i) => (
        <li key={i} className="leading-relaxed">
          {typeof it === "string" || typeof it === "number" ? (
            String(it)
          ) : (
            <ValueRenderer value={it as Json} />
          )}
        </li>
      ))}
    </ul>
  );
}

function TableRenderer({ rows }: { rows: Json[] }) {
  const objRows = rows.filter((r) => r && typeof r === "object" && !Array.isArray(r)) as Record<
    string,
    Json
  >[];
  if (objRows.length === 0) return <ValueRenderer value={rows} />;
  const cols = Array.from(new Set(objRows.flatMap((r) => Object.keys(r))));
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            {cols.map((c) => (
              <th key={c} className="text-left px-3 py-2 font-medium">
                {humanizeKey(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {objRows.map((r, i) => (
            <tr key={i} className="border-t">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 align-top">
                  {stringifyShort(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpiGrid({ items }: { items: Json[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it, i) => {
        const o = (typeof it === "object" && it) as Record<string, Json> | null;
        const label = (o?.label ?? o?.name ?? o?.title ?? `Item ${i + 1}`) as string;
        const value = o?.value ?? o?.score ?? it;
        return (
          <div key={i} className="rounded-lg border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-display font-semibold mt-0.5">
              {stringifyShort(value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Quote({ text }: { text: string }) {
  return (
    <blockquote className="border-l-4 border-[var(--color-gold)] pl-4 italic text-muted-foreground">
      {text}
    </blockquote>
  );
}

function ObjectionsList({ items }: { items: Json[] }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const o = (typeof it === "object" && it) as Record<string, Json> | null;
        const objecao = (o?.objection ?? o?.objecao ?? o?.title ?? String(it)) as string;
        const resposta = (o?.response ?? o?.resposta ?? o?.answer) as string | undefined;
        return (
          <div key={i} className="rounded-md border p-3">
            <div className="text-sm font-medium">⚠︎ {objecao}</div>
            {resposta && <div className="text-sm text-muted-foreground mt-1">→ {resposta}</div>}
          </div>
        );
      })}
    </div>
  );
}

function StakeholderList({ items }: { items: Json[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((it, i) => {
        const o = (typeof it === "object" && it) as Record<string, Json> | null;
        const name = (o?.name ?? o?.nome ?? String(it)) as string;
        const role = (o?.role ?? o?.cargo ?? o?.position) as string | undefined;
        const influence = (o?.influence ?? o?.influencia) as string | undefined;
        return (
          <div key={i} className="rounded-md border p-3">
            <div className="font-medium text-sm">{name}</div>
            {role && <div className="text-xs text-muted-foreground">{role}</div>}
            {influence && (
              <Badge variant="secondary" className="mt-1.5">
                {influence}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoresBlock({ scores }: { scores: Json }) {
  const entries: Array<[string, number, number | undefined, string | undefined]> = [];
  if (Array.isArray(scores)) {
    scores.forEach((s, i) => {
      if (typeof s === "object" && s) {
        const o = s as Record<string, Json>;
        entries.push([
          (o.label ?? o.name ?? `Score ${i + 1}`) as string,
          Number(o.value ?? o.score ?? 0),
          o.max != null ? Number(o.max) : 100,
          typeof o.description === "string" ? o.description : undefined,
        ]);
      }
    });
  } else if (typeof scores === "object" && scores) {
    Object.entries(scores).forEach(([k, v]) => {
      if (typeof v === "number") entries.push([humanizeKey(k), v, 100, undefined]);
      else if (typeof v === "object" && v) {
        const o = v as Record<string, Json>;
        entries.push([
          humanizeKey(k),
          Number(o.value ?? o.score ?? 0),
          o.max != null ? Number(o.max) : 100,
          typeof o.description === "string" ? o.description : undefined,
        ]);
      }
    });
  }

  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display">Indicadores</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {entries.map(([label, value, max, desc]) => (
          <div key={label}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">{label}</span>
              <span className="text-sm font-semibold">
                {value}
                {max ? <span className="text-muted-foreground">/{max}</span> : null}
              </span>
            </div>
            <Progress value={max ? (value / max) * 100 : value} className="mt-1.5 h-2" />
            {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecommendationsBlock({ recs }: { recs: Json }) {
  const items = coerceArray(recs);
  if (items.length === 0) return null;
  return (
    <Card className="border-l-4 border-l-[var(--color-gold)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display">Recomendações</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((it, i) => {
            if (typeof it === "string") {
              return (
                <div key={i} className="flex gap-3">
                  <span className="text-gold font-display font-semibold">{i + 1}.</span>
                  <span className="text-sm leading-relaxed">{it}</span>
                </div>
              );
            }
            const o = it as Record<string, Json>;
            return (
              <div key={i} className="flex gap-3">
                <span className="text-gold font-display font-semibold">{i + 1}.</span>
                <div>
                  <div className="font-medium text-sm">
                    {(o.title ?? o.titulo ?? "Ação") as string}
                  </div>
                  {(o.description ?? o.descricao) != null && (
                    <div className="text-sm text-muted-foreground">
                      {(o.description ?? o.descricao) as string}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function coerceArray(v: Json): Json[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v as Record<string, Json>);
  if (v == null) return [];
  return [v];
}
function humanizeKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function stringifyShort(v: Json): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
