import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRouteUser } from "@/lib/auth/route";
import { loadDocImage } from "@/lib/exports/doc-image";

export const dynamic = "force-dynamic";

// Imágenes subidas desde el navegador (ya convertidas a PNG), máx. ~4 MB.
const imageDataUri = z.string().max(6_000_000).regex(/^data:image\/(png|jpe?g);base64,/i);

const settingsUpdateSchema = z.object({
  company_name: z.string().optional(),
  logo_url: z.union([z.string().url().max(2000), imageDataUri, z.literal("")]).optional(),
  signer_name: z.string().max(160).optional(),
  signer_role: z.string().max(120).optional(),
  signature_data: z.union([imageDataUri, z.literal("")]).optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional(),
});

export async function GET() {
  try {
    const { user, response } = await requireRouteUser();
    if (response) {
      return response;
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      white_label_config: user.white_label_config || {},
      widget_api_key: user.widget_api_key,
      audit_credits_remaining: user.audit_credits_remaining,
      scout_credits_remaining: user.scout_credits_remaining,
    });
  } catch (error) {
    console.error("Settings GET error:", error);
    return NextResponse.json(
      { error: "No se pudo obtener la configuración" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { user, response } = await requireRouteUser();
    if (response) {
      return response;
    }

    const updated = await db.updateUser(user.id, {
      white_label_config: {
        ...user.white_label_config,
        ...parsed.data,
      },
    });

    // Verifica que el logo realmente se pueda incrustar en los documentos.
    const logo = parsed.data.logo_url?.trim();
    const warning =
      logo && !(await loadDocImage(logo))
        ? "Se guardó, pero el logo de esa URL no se puede usar en los documentos (no es una imagen accesible o su formato no es compatible). Usa el botón «Subir» para cargar el archivo; mientras tanto se usará el escudo por defecto."
        : undefined;

    return NextResponse.json({
      id: updated?.id,
      email: updated?.email,
      name: updated?.name,
      white_label_config: updated?.white_label_config || {},
      widget_api_key: updated?.widget_api_key,
      message: "Configuración actualizada",
      warning,
    });
  } catch (error) {
    console.error("Settings PUT error:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la configuración", details: String(error) },
      { status: 500 },
    );
  }
}
