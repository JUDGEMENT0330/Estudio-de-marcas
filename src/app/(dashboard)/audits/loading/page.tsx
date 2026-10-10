"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AuditLoading } from "@/components/reports/audit-loading";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Report } from "@/lib/db/types";

/**
 * /audits/loading — Instant loading experience page
 *
 * The audit form redirects here immediately (no API wait).
 * This page:
 *  1. Renders the AuditLoading component instantly (step animation starts)
 *  2. Fires POST /api/audit in the background
 *  3. Once we get a reportId, passes it to AuditLoading for polling
 *  4. On completion, replaces URL to /audits/{id} (no back-button to loading)
 */
function AuditLoadingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const businessName = searchParams.get("businessName") || "Negocio";
  const city = searchParams.get("city") || undefined;
  const state = searchParams.get("state") || undefined;
  const url = searchParams.get("url") || undefined;
  const googleMapsUrl = searchParams.get("googleMapsUrl") || undefined;
  const customDirection = searchParams.get("customDirection") || undefined;

  const [reportId, setReportId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const hasFired = useRef(false);

  // ── Fire the API call once on mount ───────────────────────────────
  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    async function createAudit() {
      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName,
            city,
            state,
            url,
            googleMapsUrl,
            customDirection,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "No se pudo iniciar la auditoría");
          return;
        }

        if (data.reportId) {
          // If the sync fallback already completed, go straight to report
          if (data.status === "completed") {
            router.replace(`/audits/${data.reportId}`);
            return;
          }
          // Otherwise, pass reportId to AuditLoading for polling
          setReportId(data.reportId);
        } else {
          setError("No se recibió el identificador del reporte");
        }
      } catch (err: any) {
        setError(err.message || "Error de red: inténtalo de nuevo");
      }
    }

    createAudit();
  }, [businessName, city, state, url, googleMapsUrl, customDirection, router]);

  // ── Handle completion ─────────────────────────────────────────────
  const handleComplete = useCallback(
    (report: Report) => {
      // Invalidate Next.js Router Cache so the /audits list shows this new report
      router.refresh();
      // Replace URL so back button goes to /audits, not back to loading
      router.replace(`/audits/${report.id}`);
    },
    [router]
  );

  // ── Error state ───────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">No se pudo iniciar la auditoría</h2>
        <p className="text-muted-foreground text-center max-w-md mb-6">{error}</p>
        <div className="flex gap-3">
          <Link href="/audits/new">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Reintentar
            </Button>
          </Link>
          <Link href="/audits">
            <Button variant="ghost">Volver a auditorías</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading experience ────────────────────────────────────────────
  return (
    <AuditLoading
      reportId={reportId}
      businessName={businessName}
      city={city}
      onComplete={handleComplete}
    />
  );
}

export default function AuditLoadingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AuditLoadingContent />
    </Suspense>
  );
}
