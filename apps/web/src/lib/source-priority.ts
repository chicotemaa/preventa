import type { SourceSearchStatus } from "@/types/search";

export type SourceChannel = "own" | "mayorista" | "minorista";
export type ExpectedSourceStatus =
  | "ok"
  | "sin_datos"
  | "timeout"
  | "failed"
  | "pending"
  | "requires_login"
  | "not_configured"
  | "no_public_prices";

export type SourcePriorityConfig = {
  sourceId: string;
  aliases: string[];
  displayName: string;
  channel: SourceChannel;
  priority: number;
  criticalForDecision: boolean;
  expectedInDashboard: boolean;
  region: string;
  fallbackStatus: ExpectedSourceStatus;
  fallbackMessage: string;
};

type SourceLike = {
  sourceId?: string | null;
  id?: string | null;
  storeName?: string | null;
  storeType?: SourceSearchStatus["storeType"] | null;
};

export const sourcePriorityConfig: SourcePriorityConfig[] = [
  {
    sourceId: "aguiar-arcor-resistencia",
    aliases: ["aguiar", "tokin", "aguiar resistencia"],
    displayName: "Aguiar / Tokin",
    channel: "own",
    priority: 0,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "requires_login",
    fallbackMessage: "Requiere credenciales Tokin para consultar precios propios.",
  },
  {
    sourceId: "vital-online",
    aliases: ["vital", "supermayorista vital", "vital online"],
    displayName: "Vital",
    channel: "mayorista",
    priority: 1,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "requires_login",
    fallbackMessage: "Requiere login/cuenta para consultar catalogo y precios confiables.",
  },
  {
    sourceId: "carrefour-comerciante-maxi",
    aliases: [
      "carrefour comerciante",
      "carrefour maxi",
      "maxi pedido",
      "maxi carrefour",
      "comerciante carrefour",
    ],
    displayName: "Carrefour Comerciante",
    channel: "mayorista",
    priority: 2,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "requires_login",
    fallbackMessage:
      "Requiere datos de comercio, sucursal y sesion autorizada para ver precios.",
  },
  {
    sourceId: "maxiconsumo-chaco-auth",
    aliases: ["maxiconsumo chaco", "maxi chaco", "maxi carrefour"],
    displayName: "Maxiconsumo Chaco",
    channel: "mayorista",
    priority: 3,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "requires_login",
    fallbackMessage: "Fuente mayorista prioritaria; revisar credenciales o disponibilidad.",
  },
  {
    sourceId: "maxiconsumo-web-moreno",
    aliases: ["maxiconsumo web", "maxiconsumo", "maxi consumo", "maxi"],
    displayName: "Maxiconsumo Web",
    channel: "mayorista",
    priority: 4,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia mayorista nacional sin datos para esta busqueda.",
  },
  {
    sourceId: "check-chek-mayorista",
    aliases: ["check", "chek", "cheek", "check mayorista", "chek mayorista"],
    displayName: "Check / Chek",
    channel: "mayorista",
    priority: 5,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "not_configured",
    fallbackMessage: "Fuente esperada para pricing mayorista; falta integrar fuente real.",
  },
  {
    sourceId: "yaguar-chaco-tienda-auth",
    aliases: ["yaguar", "jaguar", "yaguar chaco", "jaguar chaco"],
    displayName: "Yaguar",
    channel: "mayorista",
    priority: 6,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "requires_login",
    fallbackMessage: "Requiere credenciales de comerciante para consultar precios.",
  },
  {
    sourceId: "sabor-y-aroma-formosa",
    aliases: ["sabor y aroma", "sabor aroma"],
    displayName: "Sabor y Aroma",
    channel: "mayorista",
    priority: 7,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Sin datos utiles para esta busqueda.",
  },
  {
    sourceId: "cucher-mercados-ofertas",
    aliases: [
      "cucher",
      "cucher mercados",
      "cuchermercados",
      "cucher mayorista",
      "cuchermercados.com.ar",
    ],
    displayName: "Cucher Mercados",
    channel: "mayorista",
    priority: 8,
    criticalForDecision: true,
    expectedInDashboard: true,
    region: "NEA",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Ofertas publicas de Cucher Mercados sin datos para esta busqueda.",
  },
  {
    sourceId: "vea-argentina-vtex",
    aliases: ["vea", "bea", "vea argentina", "bea argentina"],
    displayName: "Vea",
    channel: "minorista",
    priority: 1,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "carrefour-argentina-vtex",
    aliases: ["carrefour", "carrefour argentina"],
    displayName: "Carrefour",
    channel: "minorista",
    priority: 2,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "masonline-changomas-vtex",
    aliases: ["changomas", "chango mas", "masonline", "mas online"],
    displayName: "ChangoMas / MasOnline",
    channel: "minorista",
    priority: 3,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "jumbo-argentina-vtex",
    aliases: ["jumbo"],
    displayName: "Jumbo",
    channel: "minorista",
    priority: 4,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "disco-argentina-vtex",
    aliases: ["disco"],
    displayName: "Disco",
    channel: "minorista",
    priority: 5,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "dia-argentina-vtex",
    aliases: ["dia", "dia argentina"],
    displayName: "DIA",
    channel: "minorista",
    priority: 6,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "laanonima-argentina-html",
    aliases: ["la anonima", "anonima"],
    displayName: "La Anonima",
    channel: "minorista",
    priority: 7,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
  {
    sourceId: "cordiez-argentina-vtex",
    aliases: ["cordiez"],
    displayName: "Cordiez",
    channel: "minorista",
    priority: 8,
    criticalForDecision: false,
    expectedInDashboard: true,
    region: "Argentina",
    fallbackStatus: "sin_datos",
    fallbackMessage: "Referencia minorista sin datos para esta busqueda.",
  },
];

const DEFAULT_SOURCE_PRIORITY = 999;

export function compareSourcePriority(first: SourceLike, second: SourceLike) {
  const firstConfig = getSourceConfig(first);
  const secondConfig = getSourceConfig(second);
  const firstChannelRank = getChannelRank(firstConfig?.channel ?? inferChannel(first));
  const secondChannelRank = getChannelRank(secondConfig?.channel ?? inferChannel(second));

  if (firstChannelRank !== secondChannelRank) {
    return firstChannelRank - secondChannelRank;
  }

  const firstPriority = firstConfig?.priority ?? DEFAULT_SOURCE_PRIORITY;
  const secondPriority = secondConfig?.priority ?? DEFAULT_SOURCE_PRIORITY;

  if (firstPriority !== secondPriority) {
    return firstPriority - secondPriority;
  }

  return getSourceDisplayName(first).localeCompare(getSourceDisplayName(second), "es");
}

export function getSourceConfig(source: SourceLike | string | null | undefined) {
  const lookup =
    typeof source === "string"
      ? normalizeSourceLookup(source)
      : normalizeSourceLookup(
          `${source?.sourceId ?? source?.id ?? ""} ${source?.storeName ?? ""}`,
        );

  if (!lookup) {
    return null;
  }

  return (
    sourcePriorityConfig.find((config) =>
      [config.sourceId, config.displayName, ...config.aliases].some((value) =>
        lookup.includes(normalizeSourceLookup(value)),
      ),
    ) ?? null
  );
}

export function getSourceChannel(source: SourceLike) {
  return getSourceConfig(source)?.channel ?? inferChannel(source);
}

export function getSourceDisplayName(source: SourceLike) {
  return getSourceConfig(source)?.displayName ?? source.storeName ?? source.sourceId ?? "";
}

export function getChannelRank(channel: SourceChannel) {
  if (channel === "own") {
    return 0;
  }

  return channel === "mayorista" ? 1 : 2;
}

export function sourceHasData(source: Pick<SourceSearchStatus, "status" | "resultsCount">) {
  return source.status === "success" && source.resultsCount > 0;
}

export function normalizeSourceLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferChannel(source: SourceLike): SourceChannel {
  if (source.sourceId === "aguiar-arcor-resistencia") {
    return "own";
  }

  return source.storeType === "mayorista" ? "mayorista" : "minorista";
}
