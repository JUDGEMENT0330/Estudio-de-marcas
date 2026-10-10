"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  MapPin, Star, Globe, Cpu, Users, BookOpen, Trophy, DollarSign,
  Brain, Lightbulb, FileText, CheckCircle2, Loader2, Rocket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Report } from "@/lib/db/types";

/* ------------------------------------------------------------------ */
/*  Step definitions — roughly mirror the audit pipeline phases        */
/* ------------------------------------------------------------------ */

type StepStatus = "waiting" | "active" | "done";

interface AnalysisStep {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Simulated duration in ms before moving to next step */
  duration: number;
}

const STEPS: AnalysisStep[] = [
  { id: "init", label: "Iniciando auditoría", detail: "Preparando el flujo de análisis y validando los datos", icon: Rocket, duration: 5000 },
  { id: "locate", label: "Ubicando el negocio", detail: "Buscando el perfil y las coordenadas en Google Maps", icon: MapPin, duration: 8000 },
  { id: "understand", label: "Comprendiendo el negocio", detail: "La IA construye conocimiento experto sobre esta categoría", icon: Brain, duration: 25000 },
  { id: "gbp", label: "Analizando el perfil de Google", detail: "Revisando horarios, fotos, atributos y nivel de completitud", icon: MapPin, duration: 12000 },
  { id: "reviews", label: "Leyendo reseñas de clientes", detail: "Temas, sentimiento y patrones de respuesta", icon: Star, duration: 15000 },
  { id: "website", label: "Midiendo velocidad del sitio", detail: "Auditoría Lighthouse de Core Web Vitals y SEO", icon: Globe, duration: 18000 },
  { id: "tech", label: "Detectando tecnología", detail: "CMS, analítica, reservas y herramientas de pago", icon: Cpu, duration: 10000 },
  { id: "social", label: "Revisando redes sociales", detail: "Facebook, Instagram, LinkedIn y más", icon: Users, duration: 12000 },
  { id: "citations", label: "Verificando directorios", detail: "Consistencia de nombre, dirección y teléfono en más de 20 directorios", icon: BookOpen, duration: 10000 },
  { id: "competitors", label: "Mapeando competidores reales", detail: "La IA busca competidores reales del mismo rubro", icon: Trophy, duration: 15000 },
  { id: "revenue", label: "Calculando impacto en el negocio", detail: "Estimando señales de impacto a partir de las brechas", icon: DollarSign, duration: 10000 },
  { id: "intel", label: "Buscando inteligencia comercial", detail: "Cruzando registros mercantiles y señales de crecimiento", icon: Lightbulb, duration: 12000 },
  { id: "ai", label: "Análisis profundo con IA", detail: "Un modelo de frontera sintetiza todos los datos con criterio experto", icon: Brain, duration: 60000 },
  { id: "narrative", label: "Redactando el resumen ejecutivo", detail: "Narrativa de nivel consultor a partir del análisis", icon: FileText, duration: 45000 },
  { id: "assemble", label: "Armando el reporte final", detail: "Calificando, priorizando recomendaciones y empaquetando", icon: CheckCircle2, duration: 8000 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AuditLoadingProps {
  /** Optional — can be undefined while the API call to create the report is still in-flight */
  reportId?: string;
  businessName: string;
  city?: string;
  onComplete: (report: Report) => void;
  /** Optional — called if the API creation itself fails (only relevant from loading page) */
  onError?: (message: string) => void;
}

export function AuditLoading({ reportId, businessName, city, onComplete }: AuditLoadingProps) {
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    STEPS.map((_, i) => (i === 0 ? "active" : "waiting"))
  );
  const [elapsed, setElapsed] = useState(0);
  const [reportReady, setReportReady] = useState(false);
  const startTime = useRef(Date.now());
  const activeStepRef = useRef(0);

  // ── Simulated step progression ────────────────────────────────────
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    function advanceStep() {
      const current = activeStepRef.current;
      if (current >= STEPS.length - 1) return; // stay on last step until report is ready

      setStepStatuses((prev) => {
        const next = [...prev];
        next[current] = "done";
        next[current + 1] = "active";
        return next;
      });
      activeStepRef.current = current + 1;

      // Schedule next step
      if (current + 1 < STEPS.length - 1) {
        timeout = setTimeout(advanceStep, STEPS[current + 1].duration);
      }
    }

    timeout = setTimeout(advanceStep, STEPS[0].duration);
    return () => clearTimeout(timeout);
  }, []);

  // ── Elapsed timer ─────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Poll for completion (only when reportId is available) ─────────
  const poll = useCallback(async () => {
    if (!reportId) return; // can't poll yet — API hasn't returned reportId

    try {
      const res = await fetch(`/api/report/${reportId}`, {
        cache: "no-store",
        next: { revalidate: 0 },
      });
      if (!res.ok) return;
      const data: Report = await res.json();

      if (data.status === "completed" || data.status === "failed") {
        // Mark all steps done
        setStepStatuses(STEPS.map(() => "done"));
        setReportReady(true);

        // Brief pause for the "complete" animation, then hand off
        setTimeout(() => onComplete(data), 1200);
      }
    } catch {
      // silent — will retry on next interval
    }
  }, [reportId, onComplete]);

  useEffect(() => {
    if (!reportId) return; // don't start polling until we have a reportId

    const interval = setInterval(poll, 3000);
    // Also poll immediately
    poll();
    return () => clearInterval(interval);
  }, [poll, reportId]);

  // ── Helpers ───────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m} min ${sec} s` : `${sec} s`;
  };

  const doneCount = stepStatuses.filter((s) => s === "done").length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <div className="relative inline-flex items-center justify-center mb-4">
          <div className="absolute h-20 w-20 rounded-full bg-primary/10 motion-safe:animate-ping" style={{ animationDuration: "2.4s" }} />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] bg-white shadow-raised">
            <img src="/brand/escudo.png" alt="" className="h-12 w-12" />
          </div>
        </div>
        <p className="eyebrow text-brand-gold">Auditoría en curso</p>
        <h2 className="mt-1 text-[28px] font-semibold">
          Analizando {businessName}
        </h2>
        {city && (
          <p className="text-muted-foreground mt-1">{city}</p>
        )}
        <div className="flex items-center justify-center gap-4 mt-3">
          <Badge variant="secondary" className="tabular-nums">
            {formatTime(elapsed)} transcurridos
          </Badge>
          {!reportReady && (
            <Badge variant="outline" className="tabular-nums">
              {progress}% completado
            </Badge>
          )}
          {reportReady && (
            <Badge className="bg-green-100 text-green-800">
              Reporte listo
            </Badge>
          )}
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────── */}
      <div className="h-1.5 rounded-full bg-secondary mb-8 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-navy to-brand-blue transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ width: `${reportReady ? 100 : progress}%` }}
        />
      </div>

      {/* ── Step timeline ──────────────────────────────────────────── */}
      <div className="space-y-1">
        {STEPS.map((step, i) => {
          const status = stepStatuses[i];
          const StepIcon = step.icon;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 transition-[opacity,background-color] duration-500 ${status === "active"
                  ? "bg-primary/5 border border-primary/20"
                  : status === "done"
                    ? "opacity-60"
                    : "opacity-30"
                }`}
            >
              {/* Icon */}
              <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 transition-colors duration-500 ${status === "active"
                  ? "bg-primary text-primary-foreground"
                  : status === "done"
                    ? "bg-green-100 text-green-700"
                    : "bg-secondary text-muted-foreground"
                }`}>
                {status === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : status === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${status === "active" ? "text-foreground" : "text-muted-foreground"
                  }`}>
                  {step.label}
                </p>
                {status === "active" && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {step.detail}
                  </p>
                )}
              </div>

              {/* Status indicator */}
              {status === "active" && (
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer tip ─────────────────────────────────────────────── */}
      {!reportReady && (
        <p className="text-center text-xs text-muted-foreground mt-8">
          Una auditoría profunda suele tardar de 4 a 6 minutos. La IA investiga el negocio, analiza competidores y redacta un reporte de nivel consultor. Puedes salir de esta página: el reporte se guardará.
        </p>
      )}
    </div>
  );
}
