import type { ReportStatus } from "@/lib/db/types";

export function reportListActionLabel(status: ReportStatus): string {
  if (status === "completed") return "Ver reporte";
  if (status === "failed") return "Fallida";
  return "Procesando…";
}

export function reportStatusLabel(status: ReportStatus): string {
  switch (status) {
    case "completed":
      return "Completada";
    case "failed":
      return "Fallida";
    case "partial":
      return "Parcial";
    case "queued":
      return "En cola";
    default:
      return "Procesando";
  }
}

export function reportStatusBadgeClass(status: ReportStatus): string {
  if (status === "completed") return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
  if (status === "failed") return "bg-red-100 text-red-800 hover:bg-red-100";
  return "";
}
