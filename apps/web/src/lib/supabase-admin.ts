type InsertOptions = {
  returning?: "minimal" | "representation";
  select?: string;
};

type SelectOptions = {
  select?: string;
  filters?: Record<string, string | number | boolean>;
  order?: string;
  limit?: number;
};

type DeleteOptions = {
  filters?: Record<string, string | number | boolean>;
};

type UpdateOptions = {
  filters?: Record<string, string | number | boolean>;
};

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && getSupabaseServerKey());
}

export async function insertSupabaseRows<T>(
  table: string,
  rows: unknown,
  options: InsertOptions = {},
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serverKey = getSupabaseServerKey();

  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase no esta configurado.");
  }

  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  const search = options.select
    ? `?select=${encodeURIComponent(options.select)}`
    : "";
  const headers = buildSupabaseHeaders(serverKey, {
    prefer: `return=${options.returning ?? "minimal"}`,
  });

  const response = await fetch(`${normalizedUrl}/rest/v1/${table}${search}`, {
    method: "POST",
    headers,
    body: JSON.stringify(rows),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Supabase respondio con estado ${response.status}.`,
    );
  }

  if (options.returning !== "representation") {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function selectSupabaseRows<T>(
  table: string,
  options: SelectOptions = {},
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serverKey = getSupabaseServerKey();

  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase no esta configurado.");
  }

  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();

  if (options.select) {
    params.set("select", options.select);
  }

  if (options.order) {
    params.set("order", options.order);
  }

  if (options.limit) {
    params.set("limit", String(options.limit));
  }

  for (const [key, value] of Object.entries(options.filters ?? {})) {
    params.set(key, String(value));
  }

  const response = await fetch(
    `${normalizedUrl}/rest/v1/${table}?${params.toString()}`,
    {
      method: "GET",
      headers: buildSupabaseHeaders(serverKey),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Supabase respondio con estado ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

export async function deleteSupabaseRows(
  table: string,
  options: DeleteOptions = {},
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serverKey = getSupabaseServerKey();

  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase no esta configurado.");
  }

  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();

  if (Object.keys(options.filters ?? {}).length === 0) {
    throw new Error("No se puede eliminar en Supabase sin filtros.");
  }

  for (const [key, value] of Object.entries(options.filters ?? {})) {
    params.set(key, String(value));
  }

  const query = params.toString();
  const response = await fetch(
    `${normalizedUrl}/rest/v1/${table}${query ? `?${query}` : ""}`,
    {
      method: "DELETE",
      headers: buildSupabaseHeaders(serverKey, { prefer: "return=minimal" }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Supabase respondio con estado ${response.status}.`,
    );
  }
}

export async function updateSupabaseRows(
  table: string,
  values: unknown,
  options: UpdateOptions = {},
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serverKey = getSupabaseServerKey();

  if (!supabaseUrl || !serverKey) {
    throw new Error("Supabase no esta configurado.");
  }

  if (Object.keys(options.filters ?? {}).length === 0) {
    throw new Error("No se puede actualizar en Supabase sin filtros.");
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(options.filters ?? {})) {
    params.set(key, String(value));
  }

  const normalizedUrl = supabaseUrl.replace(/\/$/, "");
  const response = await fetch(
    `${normalizedUrl}/rest/v1/${table}?${params.toString()}`,
    {
      method: "PATCH",
      headers: buildSupabaseHeaders(serverKey, { prefer: "return=minimal" }),
      body: JSON.stringify(values),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      errorText || `Supabase respondio con estado ${response.status}.`,
    );
  }
}

function getSupabaseServerKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
}

function isSupabasePlatformKey(key: string) {
  return key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
}

function buildSupabaseHeaders(
  serverKey: string,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    apikey: serverKey,
    "content-type": "application/json",
    ...extraHeaders,
  };

  if (!isSupabasePlatformKey(serverKey)) {
    headers.authorization = `Bearer ${serverKey}`;
  }

  return headers;
}
