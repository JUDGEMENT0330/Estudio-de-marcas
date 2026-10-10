"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuditInput, ReportStatus } from "@/lib/db/types";

type Mode = "refresh" | "edit" | "delete" | null;

interface ReportActionsProps {
  reportId: string;
  status: ReportStatus;
  input: AuditInput;
  /** "page": botones con texto (página del reporte). "list": íconos compactos. */
  variant?: "page" | "list";
  /** Después de actualizar/editar (la página del reporte recarga sus datos). */
  onChanged?: () => void;
  /** true = tras eliminar se queda en la página y solo la refresca (lista). */
  stayAfterDelete?: boolean;
}

const FIELDS: { key: keyof AuditInput; label: string; placeholder: string; type?: "url" }[] = [
  { key: "businessName", label: "Nombre del negocio", placeholder: "Perfumería Áurea" },
  { key: "city", label: "Ciudad / municipio", placeholder: "San Salvador" },
  { key: "state", label: "Departamento", placeholder: "San Salvador" },
  { key: "url", label: "Sitio web", placeholder: "https://…", type: "url" },
  { key: "googleMapsUrl", label: "Enlace de Google Maps", placeholder: "https://maps.google.com/…", type: "url" },
];

export function ReportActions({ reportId, status, input, variant = "page", onChanged, stayAfterDelete }: ReportActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AuditInput>(input);
  const running = status === "processing" || status === "queued";

  const open = (next: Mode) => {
    setError(null);
    setForm(input);
    setMode(next);
  };

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar el reporte.");
      setMode(null);
      onChanged?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/report/${reportId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo eliminar el reporte.");
      setMode(null);
      if (!stayAfterDelete) router.push("/audits");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  };

  const edited = FIELDS.some(({ key }) => (form[key] ?? "") !== (input[key] ?? "")) || (form.customDirection ?? "") !== (input.customDirection ?? "");
  const changes = Object.fromEntries(
    [...FIELDS.map((f) => f.key), "customDirection" as const].map((key) => [key, form[key] ?? ""]),
  );

  const compact = variant === "list";
  return (
    <>
      <div className={compact ? "flex items-center gap-0.5" : "flex flex-wrap gap-2"}>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "h-9 w-9" : undefined}
          onClick={() => open("refresh")}
          disabled={running}
          title="Actualizar con los mismos datos"
        >
          <RefreshCw className="h-4 w-4" />
          {!compact && "Actualizar"}
        </Button>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "h-9 w-9" : undefined}
          onClick={() => open("edit")}
          disabled={running}
          title="Editar datos del negocio"
        >
          <Pencil className="h-4 w-4" />
          {!compact && "Editar datos"}
        </Button>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "sm"}
          className={compact ? "h-9 w-9 text-destructive hover:text-destructive" : "text-destructive hover:text-destructive"}
          onClick={() => open("delete")}
          title="Eliminar reporte"
        >
          <Trash2 className="h-4 w-4" />
          {!compact && "Eliminar"}
        </Button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(next) => !busy && !next && setMode(null)}>
        <DialogContent className={mode === "edit" ? "sm:max-w-lg" : "sm:max-w-md"}>
          {mode === "refresh" && (
            <>
              <DialogHeader>
                <DialogTitle>Actualizar reporte</DialogTitle>
                <DialogDescription>
                  Se volverá a analizar «{input.businessName}» con los mismos datos para traer reseñas, métricas y competidores al día.
                  El contenido actual se reemplaza; los aportes del agente IA que aprobaste se conservan. Usa 1 crédito de auditoría.
                </DialogDescription>
              </DialogHeader>
              {error && <p className="rounded-xl bg-destructive/10 p-3 text-[13px] text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancelar</Button>
                <Button onClick={() => patch({ regenerate: true })} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Actualizar ahora
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle>Editar datos del reporte</DialogTitle>
                <DialogDescription>
                  Corrige el nombre, la ubicación o los enlaces. Puedes solo guardar los datos o guardarlos y volver a generar el análisis.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <label key={field.key} className={field.key === "businessName" || field.type === "url" ? "sm:col-span-2" : undefined}>
                    <span className="text-[13px] font-medium text-foreground/80">{field.label}</span>
                    <Input
                      className="mt-1.5"
                      type={field.type ?? "text"}
                      value={form[field.key] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    />
                  </label>
                ))}
                <label className="sm:col-span-2">
                  <span className="text-[13px] font-medium text-foreground/80">Indicaciones para el análisis (opcional)</span>
                  <Textarea
                    className="mt-1.5 min-h-[72px]"
                    value={form.customDirection ?? ""}
                    placeholder="Ej.: enfócate en ventas por WhatsApp y competidores de Santa Tecla"
                    onChange={(e) => setForm({ ...form, customDirection: e.target.value })}
                  />
                </label>
              </div>
              {error && <p className="rounded-xl bg-destructive/10 p-3 text-[13px] text-destructive">{error}</p>}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancelar</Button>
                <Button variant="secondary" onClick={() => patch({ input: changes })} disabled={busy || !edited || !form.businessName?.trim()}>
                  Solo guardar
                </Button>
                <Button onClick={() => patch({ input: changes, regenerate: true })} disabled={busy || !form.businessName?.trim()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Guardar y actualizar
                </Button>
              </DialogFooter>
            </>
          )}

          {mode === "delete" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Eliminar este reporte?</DialogTitle>
                <DialogDescription>
                  Se borrará de forma permanente la auditoría de «{input.businessName}», incluidos los aportes del agente IA. Esta acción no se puede deshacer.
                </DialogDescription>
              </DialogHeader>
              {error && <p className="rounded-xl bg-destructive/10 p-3 text-[13px] text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancelar</Button>
                <Button variant="destructive" onClick={remove} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Eliminar definitivamente
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
