import { NextResponse, type NextRequest } from "next/server";

const AUTH_PAGES = ["/login", "/signup"];

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  return response;
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Protección opcional por contraseña (recomendada en Vercel, donde la app es
 * pública): define APP_PASSWORD (y opcionalmente APP_USERNAME) para exigir
 * autenticación HTTP básica en toda la app. Los reportes compartidos (/r/...)
 * y el chequeo de salud quedan públicos.
 */
const PUBLIC_PREFIXES = ["/r/", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthorized(request: NextRequest, password: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const pass = decoded.slice(separator + 1);
    const expectedUser = process.env.APP_USERNAME?.trim();
    return pass === password && (!expectedUser || user === expectedUser);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const password = process.env.APP_PASSWORD?.trim();

  if (password && !isPublicPath(pathname) && !isAuthorized(request, password)) {
    return applySecurityHeaders(
      new NextResponse("Autenticación requerida", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Estudio de Marcas", charset="UTF-8"' },
      }),
    );
  }

  if (isAuthPage(pathname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/audits";
    dashboardUrl.search = "";
    return applySecurityHeaders(NextResponse.redirect(dashboardUrl));
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
