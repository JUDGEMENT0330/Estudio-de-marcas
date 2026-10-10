"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Cloud, ExternalLink, HardDrive, HelpCircle, KeyRound, Palette, Trash2, Zap } from "lucide-react";

interface UserSettings {
  id: string;
  email: string;
  name?: string;
  white_label_config?: {
    company_name?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  widget_api_key?: string;
}

interface RuntimeInfo {
  entorno: "local" | "vercel";
  almacenamiento: "kv" | "sqlite" | "sqlite-efimero";
  persistente: boolean;
}

const BRAND_DEFAULTS = {
  company_name: "CYBER VALTORIX SAS. DE C.V.",
  logo_url: "",
  primary_color: "#1F3864",
  secondary_color: "#C09A3A",
  contact_email: "alexmancia@cybervaltorix.com",
  contact_phone: "7803 9807",
};

const STORAGE_LABEL: Record<RuntimeInfo["almacenamiento"], string> = {
  kv: "Redis / Vercel KV (persistente)",
  sqlite: "SQLite local (persistente)",
  "sqlite-efimero": "SQLite temporal (se borra al reiniciar)",
};

interface DataSource {
  key: string;
  provider: string;
  label: string;
  configured: boolean;
  maskedValue?: string;
  status: "connected" | "missing" | "invalid" | "needs_attention" | "optional";
  required: boolean;
  unlocks: string;
  source: "sqlite" | "env" | "missing";
  setup?: {
    docsUrl: string;
    envVar: string;
    steps: string[];
  };
  lastTestedAt?: string;
  lastTestMessage?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [sourceInputs, setSourceInputs] = useState<Record<string, string>>({});
  const [sourceBusy, setSourceBusy] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState(BRAND_DEFAULTS);

  const loadDataSources = async () => {
    const response = await fetch("/api/settings/data-sources");
    if (response.ok) {
      const data = await response.json();
      setDataSources(data.sources || []);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [response, health] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/health").catch(() => null),
        ]);
        if (health?.ok) setRuntime(await health.json());
        if (response.ok) {
          const data = await response.json();
          setSettings(data);
          const config = data.white_label_config || {};
          setFormData({
            company_name: config.company_name || BRAND_DEFAULTS.company_name,
            logo_url: config.logo_url || "",
            primary_color: config.primary_color || BRAND_DEFAULTS.primary_color,
            secondary_color: config.secondary_color || BRAND_DEFAULTS.secondary_color,
            contact_email: config.contact_email || BRAND_DEFAULTS.contact_email,
            contact_phone: config.contact_phone || BRAND_DEFAULTS.contact_phone,
          });
        }
        await loadDataSources();
      } catch (error) {
        console.error("Failed to load settings:", error);
        setMessage({ type: "error", text: "No se pudo cargar la configuración." });
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const setBusy = (key: string, busy: boolean) => {
    setSourceBusy((prev) => ({ ...prev, [key]: busy }));
  };

  const saveDataSource = async (key: string) => {
    const value = sourceInputs[key]?.trim();
    if (!value) {
      setMessage({ type: "error", text: "Pega una llave antes de guardar." });
      return;
    }

    setBusy(key, true);
    try {
      const response = await fetch(`/api/settings/data-sources/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error("Save failed");
      setSourceInputs((prev) => ({ ...prev, [key]: "" }));
      await loadDataSources();
      setMessage({ type: "success", text: "Fuente guardada. Las nuevas auditorías la usarán de inmediato." });
    } catch {
      setMessage({ type: "error", text: "No se pudo guardar esta fuente de datos." });
    } finally {
      setBusy(key, false);
    }
  };

  const testDataSource = async (key: string) => {
    setBusy(key, true);
    try {
      const value = sourceInputs[key]?.trim();
      const response = await fetch(`/api/settings/data-sources/${key}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value ? { value } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "La prueba de conexión falló.");
      await loadDataSources();
      setMessage({ type: body.status === "connected" ? "success" : "error", text: body.message });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "La prueba de conexión falló." });
    } finally {
      setBusy(key, false);
    }
  };

  const deleteDataSource = async (key: string) => {
    setBusy(key, true);
    try {
      const response = await fetch(`/api/settings/data-sources/${key}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      await loadDataSources();
      setMessage({ type: "success", text: "Fuente de datos eliminada." });
    } catch {
      setMessage({ type: "error", text: "No se pudo eliminar esta fuente de datos." });
    } finally {
      setBusy(key, false);
    }
  };

  const statusLabel = (source: DataSource) => {
    if (source.status === "connected") return "Conectada";
    if (source.status === "invalid") return "Inválida";
    if (source.status === "needs_attention") return "Requiere atención";
    return source.required ? "Falta" : "Opcional";
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setMessage({ type: "success", text: "Identidad de marca guardada. Se aplicará a los próximos documentos." });
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "No se pudo guardar la configuración." });
      }
    } catch (error) {
      console.error("Save error:", error);
      setMessage({ type: "error", text: "No se pudo guardar la configuración." });
    } finally {
      setSaving(false);
    }
  };

  const connected = dataSources.filter((source) => source.status === "connected").length;
  const missing = dataSources.filter((source) => source.status === "missing").length;
  const optional = dataSources.filter((source) => source.status === "optional").length;

  if (loading) {
    return (
      <div className="space-y-2">
        <h1 className="text-[34px] font-semibold">Configuración</h1>
        <p className="text-muted-foreground">Cargando configuración…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow text-brand-gold">Espacio de trabajo</p>
        <h1 className="mt-1 text-[34px] font-semibold sm:text-[40px]">Configuración</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Conecta las fuentes de datos y define la identidad de marca de tus reportes.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`animate-fade-in-up rounded-2xl px-4 py-3 text-[14px] ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-brand-blue" />
            Fuentes de datos
          </CardTitle>
          <CardDescription>
            Llaves de API que usa la plataforma para auditar. Se guardan cifradas (AES-256-GCM).
            {runtime?.entorno === "vercel" && " En Vercel también puedes definirlas como variables de entorno."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{connected} {connected === 1 ? "conectada" : "conectadas"}</Badge>
            <Badge variant="outline">{missing} {missing === 1 ? "faltante" : "faltantes"}</Badge>
            <Badge variant="outline">{optional} {optional === 1 ? "opcional" : "opcionales"}</Badge>
          </div>

          <div className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl border border-black/[0.06]">
            {dataSources.map((source) => (
              <div key={source.key} className="bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold">{source.label}</h3>
                      <Badge
                        variant={
                          source.status === "connected"
                            ? "success"
                            : source.required
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {statusLabel(source)}
                      </Badge>
                      {source.source === "env" && <Badge variant="outline">Variable de entorno</Badge>}
                    </div>
                    <p className="text-[14px] text-muted-foreground">{source.unlocks}</p>
                    {source.setup && (
                      <details className="group max-w-2xl rounded-xl bg-secondary/70 px-3 py-2 text-[13px]">
                        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground/80">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          Cómo obtener esta llave
                        </summary>
                        <div className="mt-3 space-y-3 text-muted-foreground">
                          <ol className="list-decimal space-y-1 pl-5">
                            {source.setup.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono">
                              {source.setup.envVar}
                            </Badge>
                            <a
                              href={source.setup.docsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Abrir página de configuración
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      </details>
                    )}
                    {source.configured && (
                      <p className="text-[12px] text-muted-foreground">
                        Llave guardada: <span className="font-mono">{source.maskedValue}</span>
                      </p>
                    )}
                    {source.lastTestMessage && (
                      <p className="text-[12px] text-muted-foreground">{source.lastTestMessage}</p>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-col gap-2 lg:w-[380px]">
                    <Input
                      type="password"
                      autoComplete="off"
                      value={sourceInputs[source.key] || ""}
                      onChange={(event) =>
                        setSourceInputs((prev) => ({ ...prev, [source.key]: event.target.value }))
                      }
                      placeholder={source.configured ? "Pega una llave de reemplazo" : "Pega la llave"}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveDataSource(source.key)}
                        disabled={sourceBusy[source.key]}
                      >
                        <KeyRound className="h-4 w-4" />
                        Guardar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => testDataSource(source.key)}
                        disabled={sourceBusy[source.key]}
                      >
                        <Zap className="h-4 w-4" />
                        Probar
                      </Button>
                      {source.configured && source.source === "sqlite" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteDataSource(source.key)}
                          disabled={sourceBusy[source.key]}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-brand-gold" />
            Identidad de marca de los documentos
          </CardTitle>
          <CardDescription>
            Se aplica al encabezado, pie de página y colores de los PDF, Word, PowerPoint y Excel exportados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center gap-4 rounded-2xl bg-secondary/60 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={formData.logo_url || "/brand/escudo.png"} alt="" className="h-12 w-12 object-contain" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold" style={{ color: formData.primary_color }}>
                  {formData.company_name}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {formData.contact_email} · {formData.contact_phone}
                </p>
              </div>
              <div className="ml-auto flex gap-1.5">
                <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: formData.primary_color }} />
                <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: formData.secondary_color }} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-[13px] font-medium text-foreground/80">Razón social</label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => handleInputChange("company_name", e.target.value)}
                  placeholder="CYBER VALTORIX SAS. DE C.V."
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-foreground/80">URL del logo (opcional)</label>
                <Input
                  value={formData.logo_url}
                  onChange={(e) => handleInputChange("logo_url", e.target.value)}
                  placeholder="Vacío = escudo Cyber Valtorix"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-foreground/80">Color principal</label>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="color"
                    value={formData.primary_color}
                    onChange={(e) => handleInputChange("primary_color", e.target.value)}
                    className="h-11 w-16 cursor-pointer p-1"
                  />
                  <Input
                    value={formData.primary_color}
                    onChange={(e) => handleInputChange("primary_color", e.target.value)}
                    placeholder="#1F3864"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-foreground/80">Color de acento</label>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="color"
                    value={formData.secondary_color}
                    onChange={(e) => handleInputChange("secondary_color", e.target.value)}
                    className="h-11 w-16 cursor-pointer p-1"
                  />
                  <Input
                    value={formData.secondary_color}
                    onChange={(e) => handleInputChange("secondary_color", e.target.value)}
                    placeholder="#C09A3A"
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-foreground/80">Correo de contacto</label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => handleInputChange("contact_email", e.target.value)}
                  placeholder="alexmancia@cybervaltorix.com"
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-foreground/80">Teléfono de contacto</label>
                <Input
                  value={formData.contact_phone}
                  onChange={(e) => handleInputChange("contact_phone", e.target.value)}
                  placeholder="7803 9807"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Guardando…" : "Guardar identidad de marca"}
              </Button>
              <Button variant="outline" onClick={() => setFormData(BRAND_DEFAULTS)} disabled={saving}>
                Restablecer Cyber Valtorix
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entorno</CardTitle>
          <CardDescription>Dónde se ejecuta la app y dónde se guardan los reportes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-[13px] font-medium text-muted-foreground">Ejecución</label>
            <div className="mt-2">
              <Badge variant="secondary" className="gap-1.5">
                {runtime?.entorno === "vercel" ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
                {runtime?.entorno === "vercel" ? "Vercel" : "Local"}
              </Badge>
            </div>
          </div>
          <div>
            <label className="text-[13px] font-medium text-muted-foreground">Almacenamiento</label>
            <div className="mt-2">
              <Badge variant={runtime?.persistente === false ? "warning" : "secondary"}>
                {runtime ? STORAGE_LABEL[runtime.almacenamiento] : "—"}
              </Badge>
            </div>
          </div>
          <div>
            <label className="text-[13px] font-medium text-muted-foreground">Correo del espacio</label>
            <p className="mt-1 text-[15px] font-medium">{settings?.email}</p>
          </div>
          <div>
            <label className="text-[13px] font-medium text-muted-foreground">Nombre</label>
            <p className="mt-1 text-[15px] font-medium">{settings?.name || "Espacio de trabajo"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
