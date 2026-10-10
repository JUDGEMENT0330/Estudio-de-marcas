import type { MetadataRoute } from "next";

/**
 * La app es una herramienta interna: no debe aparecer en buscadores.
 * ALLOW_INDEXING=true permite la indexación si algún día se necesita.
 */
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING === "true") {
    return { rules: [{ userAgent: "*", allow: "/" }] };
  }
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
