"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, Copy, FilePlus, Globe, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { AgentInsight } from "@/lib/db/types";

interface AgentTaskInfo {
  id: string;
  label: string;
  description: string;
  research: boolean;
}

interface AgentStatus {
  configured: boolean;
  provider: string;
  providerLabel: string;
  tasks: AgentTaskInfo[];
}

interface Draft {
  task: string;
  title: string;
  content: string;
  sources: string[];
  provider?: string;
  toolsUsed: { name: string; detail: string }[];
}

const TOOL_LABEL: Record<string, string> = {
  web_search: "Búsqueda web",
  fetch_webpage: "Lectura de página",
  search_google_places: "Google Places",
  get_place_details: "Ficha de Google",
};

/** Vista previa del formato ligero que entiende el exportador. */
function InsightPreview({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed">
      {content.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1")}</li>
              ))}
            </ul>
          );
        }
        return lines.map((l, j) =>
          /^#{1,6}\s+/.test(l) ? (
            <p key={`${i}-${j}`} className="pt-1 font-semibold text-foreground">{l.replace(/^#{1,6}\s+/, "")}</p>
          ) : /^\s*(?:[-*•]|\d+[.)])\s+/.test(l) ? (
            <p key={`${i}-${j}`} className="pl-4">• {l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*(.+?)\*\*/g, "$1")}</p>
          ) : (
            <p key={`${i}-${j}`} className="text-foreground/85">{l.replace(/\*\*(.+?)\*\*/g, "$1")}</p>
          ),
        );
      })}
    </div>
  );
}

export function AIAgentPanel({
  reportId,
  insights: initialInsights,
  onInsightsChange,
}: {
  reportId: string;
  insights: AgentInsight[];
  onInsightsChange?: (insights: AgentInsight[]) => void;
}) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [insights, setInsights] = useState<AgentInsight[]>(initialInsights);

  useEffect(() => {
    fetch(`/api/report/${reportId}/agent`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setStatus(data))
      .catch(() => setStatus(null));
  }, [reportId]);

  const updateInsights = (next: AgentInsight[]) => {
    setInsights(next);
    onInsightsChange?.(next);
  };

  const run = async (task: string) => {
    setRunning(task);
    setError(null);
    setDraft(null);
    setEditing(false);
    try {
      const res = await fetch(`/api/report/${reportId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, instruction: task === "custom" ? instruction : instruction || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "El agente no pudo completar la tarea.");
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setRunning(null);
    }
  };

  const approve = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${reportId}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: draft.task,
          title: draft.title,
          content: draft.content,
          sources: draft.sources.filter((s) => /^https?:\/\//.test(s)),
          provider: draft.provider,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo agregar al informe.");
      updateInsights(data.insights);
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (insightId: string) => {
    const res = await fetch(`/api/report/${reportId}/insights?insightId=${encodeURIComponent(insightId)}`, { method: "DELETE" });
    if (res.ok) updateInsights((await res.json()).insights);
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`# ${draft.title}\n\n${draft.content}`).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="no-print overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand-gold" />
            Agente IA del reporte
          </CardTitle>
          {status &&
            (status.configured ? (
              <Badge variant="success" className="gap-1">
                <Sparkles className="h-3 w-3" /> {status.providerLabel}
              </Badge>
            ) : (
              <Badge variant="warning">Sin llave de IA</Badge>
            ))}
        </div>
        <CardDescription>
          Investiga, verifica y redacta secciones adicionales a partir de esta auditoría y de fuentes públicas. Revisa y edita cada
          borrador: solo lo que apruebes se agrega al PDF, Word, PowerPoint y Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {status && !status.configured && (
          <div className="rounded-2xl bg-yellow-50 p-4 text-[14px] text-yellow-900">
            Para activar el agente guarda una llave de Anthropic, OpenAI o Gemini en{" "}
            <Link href="/settings" className="font-medium underline">Configuración</Link>.
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(status?.tasks ?? []).map((task) => (
            <button
              key={task.id}
              type="button"
              disabled={!status?.configured || Boolean(running)}
              onClick={() => run(task.id)}
              className="press group rounded-2xl border border-black/[0.06] bg-secondary/50 p-3.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                {running === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : task.research ? <Globe className="h-4 w-4 text-primary" /> : <Wand2 className="h-4 w-4 text-primary" />}
                {task.label}
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">{task.description}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Pide algo específico: «Compara sus precios con 3 competidores de Santa Tecla», «Redacta una propuesta comercial basada en esta auditoría», «Agrega un análisis FODA»…"
            className="min-h-[72px]"
            disabled={!status?.configured || Boolean(running)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-muted-foreground">
              El texto de arriba también se suma como indicación extra a las tareas rápidas.
            </p>
            <Button size="sm" onClick={() => run("custom")} disabled={!status?.configured || Boolean(running) || !instruction.trim()}>
              {running === "custom" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Ejecutar agente
            </Button>
          </div>
        </div>

        {running && (
          <div className="flex items-center gap-3 rounded-2xl bg-primary/5 p-4 text-[14px] text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            El agente está trabajando (investigar en la web puede tardar 1–3 minutos)…
          </div>
        )}

        {error && <div className="rounded-2xl bg-destructive/10 p-4 text-[14px] text-destructive">{error}</div>}

        {draft && (
          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge>Borrador para revisar</Badge>
              <div className="flex flex-wrap gap-1.5">
                {draft.toolsUsed.slice(0, 8).map((tool, i) => (
                  <Badge key={i} variant="secondary" className="max-w-[260px] truncate" title={tool.detail}>
                    {TOOL_LABEL[tool.name] ?? tool.name}
                    {tool.detail ? `: ${tool.detail}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
            {editing ? (
              <>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <Textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className="min-h-[320px] font-mono text-[13px]" />
                <p className="text-[12px] text-muted-foreground">Formato: «## Subtítulo», «- viñeta» y párrafos separados por una línea en blanco.</p>
              </>
            ) : (
              <>
                <h3 className="text-[17px] font-semibold">{draft.title}</h3>
                <InsightPreview content={draft.content} />
              </>
            )}
            {draft.sources.length > 0 && (
              <div className="text-[12.5px] text-muted-foreground">
                <p className="font-medium">Fuentes</p>
                {draft.sources.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer" className="block truncate text-primary hover:underline">{src}</a>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={approve} disabled={saving || !draft.title.trim() || !draft.content.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus className="h-4 w-4" />}
                Aprobar y agregar al informe
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                {editing ? <Check className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                {editing ? "Ver vista previa" : "Editar"}
              </Button>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Descartar</Button>
            </div>
          </div>
        )}

        {insights.length > 0 && (
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-muted-foreground">Incluido en los documentos ({insights.length})</p>
            {insights.map((insight) => (
              <div key={insight.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{insight.title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {new Date(insight.created_at).toLocaleDateString("es-SV", { day: "numeric", month: "short", year: "numeric" })}
                    {insight.sources.length ? ` · ${insight.sources.length} fuente(s)` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => remove(insight.id)} title="Quitar del informe">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
