import { NextResponse } from "next/server";
import { getStorageBackend, isVercel } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = getStorageBackend();
  return NextResponse.json({
    status: "ok",
    service: "Estudio de Marcas · Cyber Valtorix",
    version: "0.2.0",
    entorno: isVercel() ? "vercel" : "local",
    almacenamiento: storage,
    persistente: storage !== "sqlite-efimero",
    timestamp: new Date().toISOString(),
    endpoints: [
      "POST /api/audit",
      "GET /api/report/[id]",
      "GET /api/health",
    ],
  });
}
