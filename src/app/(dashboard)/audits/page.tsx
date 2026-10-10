export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Calendar, ChevronRight, Activity, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/auth/server";
import type { AuditInput, ReportScores } from "@/lib/db/types";
import { GradeBadge } from "@/components/reports/grade-badge";
import {
  reportListActionLabel,
  reportStatusBadgeClass,
  reportStatusLabel,
} from "@/lib/reports/report-list-display";

export default async function AuditsPage() {
  const user = await requireCurrentUser();

  const reports = await db.getReportsByUser(user.id);
  const auditReports = reports.filter((r) => r.type === "audit");
  const completed = auditReports.filter((r) => r.status === "completed").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-brand-gold">Inteligencia de marca</p>
          <h1 className="mt-1 text-[34px] font-semibold text-foreground sm:text-[40px]">
            Auditorías
          </h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {auditReports.length === 0
              ? "Analiza la presencia digital de cualquier negocio en minutos."
              : `${auditReports.length} ${auditReports.length === 1 ? "auditoría" : "auditorías"} · ${completed} ${completed === 1 ? "completada" : "completadas"}`}
          </p>
        </div>
        <Link href="/audits/new">
          <Button size="lg">
            <Plus className="h-4 w-4" />
            Nueva auditoría
          </Button>
        </Link>
      </div>

      {auditReports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-sky to-white">
              <Search className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="mt-5 text-xl font-semibold">Aún no hay auditorías</h3>
            <p className="mt-2 max-w-sm text-center text-[15px] text-muted-foreground">
              Ejecuta tu primera auditoría para obtener un reporte de inteligencia completo,
              con hallazgos y recomendaciones generados por IA.
            </p>
            <Link href="/audits/new" className="mt-7">
              <Button size="lg">Crear primera auditoría</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-black/[0.06]">
            {auditReports.map((report) => {
              const input = report.input as AuditInput;
              const scores = report.scores as ReportScores | undefined;
              const isCompleted = report.status === "completed";
              const location = [input.city, input.state].filter(Boolean).join(", ");

              const row = (
                <div className="flex items-center gap-4 px-4 py-4 sm:gap-5 sm:px-6">
                  {scores ? (
                    <GradeBadge grade={scores.overall_grade} score={scores.overall_score} size="md" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                      <Activity className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-[17px] font-semibold text-foreground">
                        {input.businessName}
                      </h3>
                      <Badge variant="secondary" className={reportStatusBadgeClass(report.status)}>
                        {reportStatusLabel(report.status)}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {location || "Ubicación no indicada"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(report.created_at).toLocaleDateString("es-SV", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  {isCompleted ? (
                    <span className="flex items-center gap-1 text-[14px] font-medium text-primary">
                      <span className="hidden sm:inline">{reportListActionLabel(report.status)}</span>
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">
                      {reportListActionLabel(report.status)}
                    </span>
                  )}
                </div>
              );

              return (
                <li key={report.id}>
                  {isCompleted ? (
                    <Link
                      href={`/audits/${report.id}`}
                      className="block transition-colors duration-150 hover:bg-black/[0.02] active:bg-black/[0.04]"
                    >
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
