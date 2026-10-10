/**
 * Preferencias regionales para Google Places.
 *
 * - PLACES_LANGUAGE: idioma de los resultados (por defecto "es").
 * - PLACES_COUNTRY: restringe el autocompletado a uno o varios países
 *   (códigos ISO separados por coma, p. ej. "sv" o "sv,gt,hn"). Usa "all"
 *   para buscar en todo el mundo. Por defecto: "sv" (El Salvador).
 */
export function placesLanguage(): string {
  return process.env.PLACES_LANGUAGE?.trim() || "es";
}

export function placesCountryComponents(): string | undefined {
  const raw = (process.env.PLACES_COUNTRY ?? "sv").trim().toLowerCase();
  if (!raw || raw === "all" || raw === "*") return undefined;
  const codes = raw
    .split(/[,|\s]+/)
    .map((code) => code.trim())
    .filter((code) => /^[a-z]{2}$/.test(code))
    .slice(0, 5);
  if (codes.length === 0) return undefined;
  return codes.map((code) => `country:${code}`).join("|");
}
