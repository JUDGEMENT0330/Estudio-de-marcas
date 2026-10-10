import {
  getSecret,
  listSecretMetadata,
  type LocalSecretKey,
  type SecretMetadata,
} from "./local-secrets";

interface ProviderDefinition {
  key: LocalSecretKey;
  provider: string;
  label: string;
  env: string[];
  required: boolean;
  unlocks: string;
  setup?: {
    docsUrl: string;
    envVar: string;
    steps: string[];
  };
}

export interface DataSourceMetadata extends SecretMetadata {
  required: boolean;
  unlocks: string;
  source: "sqlite" | "env" | "missing";
  setup?: ProviderDefinition["setup"];
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    key: "google_places_api_key",
    provider: "google",
    label: "Google Places",
    env: ["GOOGLE_PLACES_API_KEY"],
    required: true,
    unlocks: "Buscar negocios, perfiles de Google, reseñas y competidores.",
    setup: {
      docsUrl: "https://console.cloud.google.com/apis/library/places-backend.googleapis.com",
      envVar: "GOOGLE_PLACES_API_KEY",
      steps: [
        "Crea o selecciona un proyecto en Google Cloud.",
        "Habilita la Places API.",
        "Crea una llave de API y pégala aquí.",
      ],
    },
  },
  {
    key: "google_pagespeed_api_key",
    provider: "google",
    label: "Google PageSpeed",
    env: ["GOOGLE_PAGESPEED_API_KEY"],
    required: false,
    unlocks: "Medir velocidad del sitio, experiencia móvil y SEO técnico.",
    setup: {
      docsUrl: "https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com",
      envVar: "GOOGLE_PAGESPEED_API_KEY",
      steps: [
        "Usa el mismo proyecto de Google Cloud que Places si es posible.",
        "Habilita la PageSpeed Insights API.",
        "Crea o reutiliza una llave de API y pégala aquí.",
      ],
    },
  },
  {
    key: "google_crux_api_key",
    provider: "google",
    label: "Google Chrome UX Report",
    env: ["GOOGLE_CRUX_API_KEY"],
    required: false,
    unlocks: "Medir el rendimiento real de usuarios de Chrome cuando la API está habilitada.",
    setup: {
      docsUrl: "https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com",
      envVar: "GOOGLE_CRUX_API_KEY",
      steps: [
        "Abre la página de Chrome UX Report API en Google Cloud.",
        "Habilita la API en el proyecto dueño de tu llave.",
        "Pega una llave con CrUX habilitado o déjalo vacío para usar la de PageSpeed o Places.",
      ],
    },
  },
  {
    key: "census_api_key",
    provider: "government",
    label: "US Census",
    env: ["CENSUS_API_KEY"],
    required: false,
    unlocks: "Contexto de mercado por código postal (solo EE. UU.): población e ingreso medio.",
    setup: {
      docsUrl: "https://api.census.gov/data/key_signup.html",
      envVar: "CENSUS_API_KEY",
      steps: [
        "Solicita una llave en la página de registro de Census Data API.",
        "Confirma la llave desde el correo que te envía Census.",
        "Pégala aquí y presiona Probar.",
      ],
    },
  },
  {
    key: "opencorporates_api_token",
    provider: "business_records",
    label: "OpenCorporates",
    env: ["OPENCORPORATES_API_TOKEN"],
    required: false,
    unlocks: "Agregar registros mercantiles públicos cuando hay un token de OpenCorporates.",
    setup: {
      docsUrl: "https://api.opencorporates.com/documentation/API-Reference",
      envVar: "OPENCORPORATES_API_TOKEN",
      steps: [
        "Crea o inicia sesión en una cuenta de OpenCorporates API.",
        "Copia el token desde la sección de cuenta/API.",
        "Pégalo aquí y presiona Probar.",
      ],
    },
  },
  {
    key: "llm_provider",
    provider: "ai",
    label: "Proveedor de IA",
    env: ["LLM_PROVIDER"],
    required: false,
    unlocks: "Elige qué proveedor de IA redacta resúmenes y recomendaciones (openai, anthropic o google).",
  },
  {
    key: "openai_api_key",
    provider: "ai",
    label: "OpenAI API Key",
    env: ["OPENAI_API_KEY"],
    required: false,
    unlocks: "Usar OpenAI para resúmenes ejecutivos y redacción estratégica.",
  },
  {
    key: "anthropic_api_key",
    provider: "ai",
    label: "Anthropic API Key",
    env: ["ANTHROPIC_API_KEY"],
    required: false,
    unlocks: "Usar Anthropic (Claude) para resúmenes ejecutivos y redacción estratégica.",
  },
  {
    key: "google_ai_api_key",
    provider: "ai",
    label: "Google Gemini API Key",
    env: ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
    required: false,
    unlocks: "Usar Gemini para resúmenes ejecutivos y redacción estratégica.",
  },
  {
    key: "yelp_api_key",
    provider: "yelp",
    label: "Yelp",
    env: ["YELP_API_KEY"],
    required: false,
    unlocks: "Fuente adicional opcional de reseñas.",
  },
];

function maskSecret(value: string): string {
  if (value.length <= 8) return "....";
  return `${value.slice(0, 4)}...${value.slice(-3)}`;
}

function envValue(definition: ProviderDefinition): string | undefined {
  for (const envName of definition.env) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return undefined;
}

export async function getProviderSecret(key: LocalSecretKey): Promise<string | undefined> {
  try {
    const sqliteValue = await getSecret(key);
    if (sqliteValue) return sqliteValue;
  } catch {
    return undefined;
  }

  const definition = PROVIDER_DEFINITIONS.find((item) => item.key === key);
  return definition ? envValue(definition) : undefined;
}

export async function listDataSources(): Promise<DataSourceMetadata[]> {
  const stored = await listSecretMetadata();
  const storedByKey = new Map(stored.map((item) => [item.key, item]));

  return PROVIDER_DEFINITIONS.map((definition) => {
    const storedMetadata = storedByKey.get(definition.key);
    if (storedMetadata) {
      return {
        ...storedMetadata,
        required: definition.required,
        unlocks: definition.unlocks,
        source: "sqlite" as const,
        setup: definition.setup,
      };
    }

    const fromEnv = envValue(definition);
    if (fromEnv) {
      return {
        key: definition.key,
        provider: definition.provider,
        label: definition.label,
        configured: true,
        maskedValue: maskSecret(fromEnv),
        status: "connected",
        required: definition.required,
        unlocks: definition.unlocks,
        source: "env" as const,
        setup: definition.setup,
      };
    }

    return {
      key: definition.key,
      provider: definition.provider,
      label: definition.label,
      configured: false,
      status: definition.required ? "missing" : "optional",
      required: definition.required,
      unlocks: definition.unlocks,
      source: "missing" as const,
      setup: definition.setup,
    };
  });
}

export function getProviderDefinition(key: LocalSecretKey): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((definition) => definition.key === key);
}
