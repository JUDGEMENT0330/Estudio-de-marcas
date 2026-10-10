import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRouteUser } from "@/lib/auth/route";
import { normalizeAuditInput, startAuditRun } from "@/lib/reports/run-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// En Vercel la auditoría sigue corriendo tras responder (vía `after`), dentro
// del límite de duración de la función. 300 s es el máximo del plan Hobby con
// Fluid Compute; en Pro puede subirse hasta 800 en vercel.json.
export const maxDuration = 300;

const auditRequestSchema = z.object({
  businessName: z.string().min(1, "El nombre del negocio es obligatorio"),
  city: z.string().optional(),
  state: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
  googleMapsUrl: z.string().url().optional().or(z.literal("")),
  customDirection: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = auditRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const { user, response } = await requireRouteUser();
    if (response) {
      return response;
    }

    const userId = user.id;

    if (user.audit_credits_remaining <= 0) {
      return NextResponse.json(
        { error: "No quedan créditos de auditoría." },
        { status: 403 }
      );
    }

    const auditInput = normalizeAuditInput(input);
    const report = await db.createReport({ user_id: userId, type: "audit", input: auditInput });

    await db.trackUsage({
      user_id: userId,
      action: "audit",
      credits_consumed: 1,
    });

    // El cliente recibe el reportId de inmediato y consulta /api/report/{id}
    // hasta que el estado cambia a "completed".
    await startAuditRun(report.id, auditInput);

    // Return immediately so the client can navigate to the progress page
    return NextResponse.json({
      reportId: report.id,
      status: "processing",
      async: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Error interno del servidor", message: err.message },
      { status: 500 }
    );
  }
}
