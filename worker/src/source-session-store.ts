import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ProductSearchResult,
  SourceSearchStatus,
  StoreType,
} from "./types.js";

const currentFilePath = fileURLToPath(import.meta.url);
const workerRoot = path.resolve(path.dirname(currentFilePath), "..");
const dataDir = resolveSourceStoreDir();
const sessionsPath = path.resolve(dataDir, "source-sessions.json");
const snapshotsPath = path.resolve(dataDir, "source-snapshots.json");

type EncodedSecret =
  | {
      encoding: "aes-256-gcm";
      value: string;
      iv: string;
      tag: string;
    }
  | {
      encoding: "plain";
      value: string;
    };

type StoredSessionRecord = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  kind: "cookie";
  cookie: EncodedSecret;
  userAgent: string;
  savedAt: string;
  updatedAt: string;
  lastValidation?: SourceSessionValidationSummary;
};

type SessionStoreFile = {
  version: 1;
  sessions: Record<string, StoredSessionRecord>;
};

export type SourceSessionValidationSummary = {
  status:
    | "authorized"
    | "private_prices"
    | "missing_cookie"
    | "logged_out"
    | "no_public_products"
    | "failed";
  ok: boolean;
  message: string;
  checkedAt: string;
  query: string;
  durationMs: number;
  productsCount: number;
  privateProductsCount: number;
  visiblePriceProductsCount: number;
};

export type SourceSessionState = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  hasSession: boolean;
  savedAt: string | null;
  updatedAt: string | null;
  isEncrypted: boolean;
  lastValidation?: SourceSessionValidationSummary;
  snapshot?: SourceCatalogSnapshotSummary;
};

export type SaveSourceSessionInput = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  cookie: string;
  userAgent: string;
  validation?: SourceSessionValidationSummary;
};

export type StoredSourceSessionCredentials = {
  sourceId: string;
  cookie: string;
  userAgent: string;
};

export type SourceCatalogSnapshot = {
  sourceId: string;
  storeName: string;
  storeType: StoreType;
  sourceUrl?: string | null;
  dataOrigin?: string;
  sourceScope?: string;
  status: SourceSearchStatus["status"];
  syncedAt: string;
  durationMs: number;
  queries: string[];
  productsCount: number;
  privateProductsCount: number;
  visiblePriceProductsCount: number;
  errors: string[];
  products: ProductSearchResult[];
};

export type SourceCatalogSnapshotSummary = Omit<
  SourceCatalogSnapshot,
  "products"
> & {
  sampleProducts: ProductSearchResult[];
};

type SnapshotStoreFile = {
  version: 1;
  snapshots: Record<string, SourceCatalogSnapshot>;
};

function resolveSourceStoreDir() {
  const configuredDir = process.env.SOURCE_SESSION_STORE_DIR?.trim();

  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  if (process.env.VERCEL) {
    return path.resolve(os.tmpdir(), "preventistas-worker-data");
  }

  return path.resolve(workerRoot, "data");
}

export async function saveSourceSession(input: SaveSourceSessionInput) {
  const store = await readSessionStore();
  const now = new Date().toISOString();
  const current = store.sessions[input.sourceId];

  store.sessions[input.sourceId] = {
    sourceId: input.sourceId,
    storeName: input.storeName,
    storeType: input.storeType,
    kind: "cookie",
    cookie: encodeSecret(input.cookie),
    userAgent: input.userAgent,
    savedAt: current?.savedAt ?? now,
    updatedAt: now,
    lastValidation: input.validation ?? current?.lastValidation,
  };

  await writeSessionStore(store);
  return getSourceSessionState(input.sourceId);
}

export async function updateSourceSessionValidation(
  sourceId: string,
  validation: SourceSessionValidationSummary,
) {
  const store = await readSessionStore();
  const current = store.sessions[sourceId];

  if (!current) {
    return null;
  }

  store.sessions[sourceId] = {
    ...current,
    updatedAt: new Date().toISOString(),
    lastValidation: validation,
  };

  await writeSessionStore(store);
  return getSourceSessionState(sourceId);
}

export async function getStoredSourceSessionCredentials(
  sourceId: string,
): Promise<StoredSourceSessionCredentials | null> {
  const store = await readSessionStore();
  const session = store.sessions[sourceId];

  if (!session) {
    return null;
  }

  return {
    sourceId,
    cookie: decodeSecret(session.cookie),
    userAgent: session.userAgent,
  };
}

export async function getSourceSessionState(
  sourceId: string,
): Promise<SourceSessionState | null> {
  const store = await readSessionStore();
  const session = store.sessions[sourceId];

  if (!session) {
    return null;
  }

  return {
    sourceId,
    storeName: session.storeName,
    storeType: session.storeType,
    hasSession: true,
    savedAt: session.savedAt,
    updatedAt: session.updatedAt,
    isEncrypted: session.cookie.encoding === "aes-256-gcm",
    lastValidation: session.lastValidation,
    snapshot: (await getSourceCatalogSnapshotSummary(sourceId)) ?? undefined,
  };
}

export async function getSourceSessionStates(): Promise<SourceSessionState[]> {
  const store = await readSessionStore();
  const states = await Promise.all(
    Object.values(store.sessions).map((session) =>
      getSourceSessionState(session.sourceId),
    ),
  );

  return states.filter((state): state is SourceSessionState => state !== null);
}

export async function saveSourceCatalogSnapshot(
  snapshot: SourceCatalogSnapshot,
) {
  const store = await readSnapshotStore();
  store.snapshots[snapshot.sourceId] = snapshot;
  await writeSnapshotStore(store);
  return getSourceCatalogSnapshotSummary(snapshot.sourceId);
}

export async function getSourceCatalogSnapshot(sourceId: string) {
  const store = await readSnapshotStore();
  return store.snapshots[sourceId] ?? null;
}

export async function getSourceCatalogSnapshotSummary(
  sourceId: string,
): Promise<SourceCatalogSnapshotSummary | null> {
  const snapshot = await getSourceCatalogSnapshot(sourceId);

  if (!snapshot) {
    return null;
  }

  const { products, ...summary } = snapshot;
  return {
    ...summary,
    sampleProducts: products.slice(0, 8),
  };
}

export async function getSourceCatalogSnapshotSummaries() {
  const store = await readSnapshotStore();
  return Promise.all(
    Object.keys(store.snapshots).map(getSourceCatalogSnapshotSummary),
  ).then((snapshots) =>
    snapshots.filter(
      (snapshot): snapshot is SourceCatalogSnapshotSummary => snapshot !== null,
    ),
  );
}

export async function getStoredSourceCatalogProducts() {
  const store = await readSnapshotStore();
  return Object.values(store.snapshots).flatMap((snapshot) => snapshot.products);
}

export async function getStoredSourceCatalogStatuses(): Promise<
  SourceSearchStatus[]
> {
  const store = await readSnapshotStore();

  return Object.values(store.snapshots).map((snapshot) => ({
    sourceId: snapshot.sourceId,
    storeName: snapshot.storeName,
    storeType: snapshot.storeType,
    sourceUrl: snapshot.sourceUrl,
    dataOrigin: snapshot.dataOrigin,
    sourceScope: snapshot.sourceScope,
    status: snapshot.status,
    resultsCount: snapshot.productsCount,
    durationMs: snapshot.durationMs,
    errorMessage:
      snapshot.status === "success"
        ? undefined
        : snapshot.errors[0] ?? "Snapshot sin productos utiles.",
  }));
}

async function readSessionStore(): Promise<SessionStoreFile> {
  try {
    const raw = await readFile(sessionsPath, "utf8");
    const parsed = JSON.parse(raw) as SessionStoreFile;
    return {
      version: 1,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    return { version: 1, sessions: {} };
  }
}

async function writeSessionStore(store: SessionStoreFile) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(sessionsPath, JSON.stringify(store, null, 2), "utf8");
}

async function readSnapshotStore(): Promise<SnapshotStoreFile> {
  try {
    const raw = await readFile(snapshotsPath, "utf8");
    const parsed = JSON.parse(raw) as SnapshotStoreFile;
    return {
      version: 1,
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return { version: 1, snapshots: {} };
  }
}

async function writeSnapshotStore(store: SnapshotStoreFile) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(snapshotsPath, JSON.stringify(store, null, 2), "utf8");
}

function encodeSecret(value: string): EncodedSecret {
  const secret = getSessionSecret();

  if (!secret) {
    return {
      encoding: "plain",
      value,
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSecretKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    encoding: "aes-256-gcm",
    value: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

function decodeSecret(secret: EncodedSecret) {
  if (secret.encoding === "plain") {
    return secret.value;
  }

  const configuredSecret = getSessionSecret();

  if (!configuredSecret) {
    throw new Error(
      "SOURCE_SESSION_SECRET no esta configurado y la sesion guardada esta cifrada.",
    );
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getSecretKey(configuredSecret),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(secret.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getSessionSecret() {
  return process.env.SOURCE_SESSION_SECRET?.trim();
}

function getSecretKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}
