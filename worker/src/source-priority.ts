import type { StoreType } from "./types.js";

type SourceChannel = "own" | "mayorista" | "minorista";

type SourcePriorityConfig = {
  sourceId: string;
  aliases: string[];
  displayName: string;
  channel: SourceChannel;
  priority: number;
};

type SourceLike = {
  sourceId?: string | null;
  id?: string | null;
  storeName?: string | null;
  storeType?: StoreType | null;
};

const SOURCE_PRIORITY_CONFIG: SourcePriorityConfig[] = [
  {
    sourceId: "aguiar-arcor-resistencia",
    aliases: ["aguiar", "tokin", "aguiar resistencia"],
    displayName: "Aguiar / Tokin",
    channel: "own",
    priority: 0,
  },
  {
    sourceId: "maxiconsumo-chaco-auth",
    aliases: ["maxiconsumo chaco", "maxi chaco"],
    displayName: "Maxiconsumo Chaco",
    channel: "mayorista",
    priority: 1,
  },
  {
    sourceId: "maxiconsumo-web-moreno",
    aliases: ["maxiconsumo web", "maxiconsumo", "maxi consumo"],
    displayName: "Maxiconsumo Web",
    channel: "mayorista",
    priority: 2,
  },
  {
    sourceId: "vital-online",
    aliases: ["vital", "supermayorista vital", "vital online"],
    displayName: "Vital",
    channel: "mayorista",
    priority: 3,
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
    priority: 4,
  },
  {
    sourceId: "cheek-resistencia-revista",
    aliases: [
      "check",
      "chek",
      "cheek",
      "cheek sa",
      "cheek resistencia",
      "cheek mayorista",
    ],
    displayName: "Cheek S.A.",
    channel: "mayorista",
    priority: 5,
  },
  {
    sourceId: "yaguar-chaco-tienda-auth",
    aliases: ["yaguar", "jaguar", "yaguar chaco", "jaguar chaco"],
    displayName: "Yaguar",
    channel: "mayorista",
    priority: 6,
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
    priority: 7,
  },
  {
    sourceId: "vea-argentina-vtex",
    aliases: ["vea", "bea", "vea argentina", "bea argentina"],
    displayName: "Vea",
    channel: "minorista",
    priority: 1,
  },
  {
    sourceId: "carrefour-argentina-vtex",
    aliases: ["carrefour", "carrefour argentina"],
    displayName: "Carrefour",
    channel: "minorista",
    priority: 2,
  },
  {
    sourceId: "masonline-changomas-vtex",
    aliases: ["changomas", "chango mas", "masonline", "mas online"],
    displayName: "ChangoMas / MasOnline",
    channel: "minorista",
    priority: 3,
  },
  {
    sourceId: "jumbo-argentina-vtex",
    aliases: ["jumbo"],
    displayName: "Jumbo",
    channel: "minorista",
    priority: 4,
  },
  {
    sourceId: "disco-argentina-vtex",
    aliases: ["disco"],
    displayName: "Disco",
    channel: "minorista",
    priority: 5,
  },
  {
    sourceId: "dia-argentina-vtex",
    aliases: ["dia", "dia argentina"],
    displayName: "DIA",
    channel: "minorista",
    priority: 6,
  },
  {
    sourceId: "laanonima-argentina-html",
    aliases: ["la anonima", "anonima"],
    displayName: "La Anonima",
    channel: "minorista",
    priority: 7,
  },
  {
    sourceId: "cordiez-argentina-vtex",
    aliases: ["cordiez"],
    displayName: "Cordiez",
    channel: "minorista",
    priority: 8,
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
    SOURCE_PRIORITY_CONFIG.find((config) =>
      [config.sourceId, config.displayName, ...config.aliases].some((value) =>
        lookup.includes(normalizeSourceLookup(value)),
      ),
    ) ?? null
  );
}

function getSourceDisplayName(source: SourceLike) {
  return getSourceConfig(source)?.displayName ?? source.storeName ?? source.sourceId ?? "";
}

function getChannelRank(channel: SourceChannel) {
  if (channel === "own") {
    return 0;
  }

  return channel === "mayorista" ? 1 : 2;
}

function inferChannel(source: SourceLike): SourceChannel {
  if (source.sourceId === "aguiar-arcor-resistencia" || source.id === "aguiar-arcor-resistencia") {
    return "own";
  }

  return source.storeType === "mayorista" ? "mayorista" : "minorista";
}

function normalizeSourceLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
