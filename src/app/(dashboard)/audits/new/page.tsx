"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutocompleteInput, type AutocompleteSuggestion } from "@/components/ui/autocomplete-input";
import { Search, MapPin, Globe, MessageSquare } from "lucide-react";

/** Generate a UUID v4 for Google Places session tokens */
function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function NewAuditPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    businessName: "",
    city: "",
    state: "",
    url: "",
    googleMapsUrl: "",
    customDirection: "",
  });

  // Session tokens for Google Places API cost optimization
  // Each autocomplete → place details flow shares one token
  const businessSessionToken = useRef(generateSessionToken());
  const citySessionToken = useRef(generateSessionToken());

  // Business name autocomplete fetcher
  const fetchBusinessSuggestions = useCallback(
    async (query: string): Promise<AutocompleteSuggestion[]> => {
      try {
        const params = new URLSearchParams({
          q: query,
          sessionToken: businessSessionToken.current,
        });
        if (formData.city) params.set("city", formData.city);

        const res = await fetch(`/api/autocomplete/business?${params}`);
        if (!res.ok) return [];
        const data = await res.json();

        return (data.suggestions || []).map(
          (s: {
            name: string;
            address?: string;
            rating?: number;
            reviewCount?: number;
            category?: string;
            city?: string;
            state?: string;
            website?: string;
            phone?: string;
            googleMapsUrl?: string;
            placeId?: string;
          }) => ({
            label: s.name,
            sublabel: [
              s.address,
              s.rating ? `${s.rating}★ (${s.reviewCount || 0} reseñas)` : null,
              s.category,
            ]
              .filter(Boolean)
              .join(" · "),
            data: {
              city: s.city,
              state: s.state,
              website: s.website,
              phone: s.phone,
              googleMapsUrl: s.googleMapsUrl,
              placeId: s.placeId,
              rating: s.rating,
              reviewCount: s.reviewCount,
              category: s.category,
              address: s.address,
            },
          })
        );
      } catch {
        return [];
      }
    },
    [formData.city]
  );

  // City autocomplete fetcher
  const fetchCitySuggestions = useCallback(
    async (query: string): Promise<AutocompleteSuggestion[]> => {
      try {
        const params = new URLSearchParams({
          q: query,
          sessionToken: citySessionToken.current,
        });
        const res = await fetch(`/api/autocomplete/city?${params}`);
        if (!res.ok) return [];
        const data = await res.json();

        return (data.suggestions || []).map(
          (s: { city: string; stateCode: string; state: string; label?: string }) => ({
            label: s.label || [s.city, s.stateCode || s.state].filter(Boolean).join(", "),
            sublabel: s.state,
            data: { city: s.city, stateCode: s.stateCode || s.state },
          })
        );
      } catch {
        return [];
      }
    },
    []
  );

  // When a business is selected — fetch place details for website/phone
  async function handleBusinessSelect(suggestion: AutocompleteSuggestion) {
    const d = suggestion.data || {};
    const placeId = d.placeId as string;

    // Immediately fill what we have from autocomplete
    setFormData((prev) => ({
      ...prev,
      businessName: suggestion.label,
      city: (d.city as string) || prev.city,
      state: (d.state as string) || prev.state,
      url: (d.website as string) || prev.url,
      googleMapsUrl: (d.googleMapsUrl as string) || prev.googleMapsUrl,
    }));

    // If we have a placeId, fetch full details (website, phone, etc.)
    if (placeId) {
      try {
        const params = new URLSearchParams({
          placeId,
          sessionToken: businessSessionToken.current,
        });
        const res = await fetch(`/api/autocomplete/place-details?${params}`);
        if (res.ok) {
          const { details } = await res.json();
          if (details) {
            setFormData((prev) => ({
              ...prev,
              city: details.city || prev.city,
              state: details.state || prev.state,
              url: details.website || prev.url,
              googleMapsUrl: details.googleMapsUrl || prev.googleMapsUrl,
            }));
          }
        }
      } catch (err) {
        console.error("Place details fetch failed:", err);
      }

      // Rotate session token after place details call (billing session complete)
      businessSessionToken.current = generateSessionToken();
    }
  }

  // When a city is selected from autocomplete
  function handleCitySelect(suggestion: AutocompleteSuggestion) {
    const d = suggestion.data || {};
    setFormData((prev) => ({
      ...prev,
      city: (d.city as string) || suggestion.label.split(",")[0],
      state: (d.stateCode as string) || prev.state,
    }));
    // Rotate city session token
    citySessionToken.current = generateSessionToken();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.businessName.trim()) return;

    // Redirect instantly to loading page — no API wait
    const params = new URLSearchParams();
    params.set("businessName", formData.businessName.trim());
    if (formData.city) params.set("city", formData.city);
    if (formData.state) params.set("state", formData.state);
    if (formData.url) params.set("url", formData.url);
    if (formData.googleMapsUrl) params.set("googleMapsUrl", formData.googleMapsUrl);
    if (formData.customDirection) params.set("customDirection", formData.customDirection);

    router.push(`/audits/loading?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="eyebrow text-brand-gold">Nueva auditoría</p>
        <h1 className="mt-1 text-[34px] font-semibold text-foreground sm:text-[40px]">
          ¿Qué negocio analizamos?
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Escribe el nombre del negocio: lo buscamos en Google Maps y completamos los datos automáticamente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del negocio</CardTitle>
          <CardDescription>
            Busca el negocio o ingresa los datos manualmente. Mientras más información, mejor la auditoría.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80" htmlFor="businessName">
                Nombre del negocio <span className="text-destructive">*</span>
              </label>
              <AutocompleteInput
                id="businessName"
                placeholder="Empieza a escribir el nombre del negocio…"
                value={formData.businessName}
                onChange={(val) => setFormData({ ...formData, businessName: val })}
                onSelect={handleBusinessSelect}
                fetchSuggestions={fetchBusinessSuggestions}
                icon={<Search className="h-4 w-4" />}
                required
                debounceMs={350}
                minChars={2}
              />
              <p className="text-[12px] text-muted-foreground">
                Selecciona un resultado para completar ciudad, departamento/estado y sitio web.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80" htmlFor="city">
                  Ciudad
                </label>
                <AutocompleteInput
                  id="city"
                  placeholder="Ej.: San Salvador"
                  value={formData.city}
                  onChange={(val) => setFormData({ ...formData, city: val })}
                  onSelect={handleCitySelect}
                  fetchSuggestions={fetchCitySuggestions}
                  icon={<MapPin className="h-4 w-4" />}
                  debounceMs={250}
                  minChars={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80" htmlFor="state">
                  Departamento / Estado
                </label>
                <Input
                  id="state"
                  placeholder="Ej.: San Salvador"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80" htmlFor="url">
                Sitio web <span className="text-[12px] font-normal text-muted-foreground">(automático o manual)</span>
              </label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="url"
                  type="url"
                  placeholder="https://ejemplo.com"
                  className="pl-10"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80" htmlFor="customDirection">
                Enfoque de investigación <span className="text-[12px] font-normal text-muted-foreground">(opcional)</span>
              </label>
              <div className="relative">
                <MessageSquare className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <textarea
                  id="customDirection"
                  placeholder="Ej.: Enfócate en su posicionamiento frente a perfumerías de nicho en El Salvador…"
                  className="flex min-h-[96px] w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-3.5 text-[15px] placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                  value={formData.customDirection}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setFormData({ ...formData, customDirection: e.target.value })
                  }
                />
              </div>
            </div>

            {(formData.city || formData.url) && formData.businessName && (
              <div className="animate-fade-in-up space-y-1 rounded-2xl bg-brand-sky/40 p-4 text-[14px]">
                <p className="eyebrow mb-2 text-brand-navy/70">Datos detectados</p>
                {formData.businessName && (
                  <p><span className="text-muted-foreground">Negocio:</span> {formData.businessName}</p>
                )}
                {formData.city && (
                  <p><span className="text-muted-foreground">Ubicación:</span> {formData.city}{formData.state ? `, ${formData.state}` : ""}</p>
                )}
                {formData.url && (
                  <p className="truncate"><span className="text-muted-foreground">Sitio web:</span> {formData.url}</p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={!formData.businessName.trim()}>
              <Search className="h-4 w-4" />
              Iniciar auditoría
            </Button>

            <p className="text-center text-[12px] text-muted-foreground">
              Datos de Google Places, PageSpeed y fuentes públicas · Análisis estratégico con IA
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
