type InsertOptions = {
  returning?: "minimal" | "representation";
  select?: string;
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
  const headers: Record<string, string> = {
    apikey: serverKey,
    "content-type": "application/json",
    prefer: `return=${options.returning ?? "minimal"}`,
  };

  if (!isSupabasePlatformKey(serverKey)) {
    headers.authorization = `Bearer ${serverKey}`;
  }

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

function getSupabaseServerKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
}

function isSupabasePlatformKey(key: string) {
  return key.startsWith("sb_secret_") || key.startsWith("sb_publishable_");
}
