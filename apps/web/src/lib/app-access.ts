import { NextResponse } from "next/server";

type AccessEnvironment = { NODE_ENV?: string; APP_ACCESS_USERNAME?: string; APP_ACCESS_PASSWORD?: string };

export async function requireAppAccess(request: Request, env: AccessEnvironment = process.env): Promise<Response | null> {
  const username = env.APP_ACCESS_USERNAME?.trim();
  const password = env.APP_ACCESS_PASSWORD;
  if (!username && !password && env.NODE_ENV !== "production") return null;
  if (!username || username.includes(":") || !password || password.length < 24) {
    return denied(503, "Acceso privado sin configurar. Contactar al administrador.");
  }
  let supplied = "";
  const authorization = request.headers.get("authorization") ?? "";
  try {
    if (/^Basic /i.test(authorization) && authorization.length < 2048) {
      supplied = new TextDecoder().decode(Uint8Array.from(atob(authorization.slice(6)), c => c.charCodeAt(0)));
    }
  } catch { /* Invalid credentials use the same challenge as missing credentials. */ }
  if (!await sameSecret(supplied, `${username}:${password}`)) {
    return denied(401, "Se requiere acceso privado.", { "WWW-Authenticate": 'Basic realm="Aguiar - acceso privado", charset="UTF-8"' });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    // Next can normalize request.url to localhost; Host retains the browser's destination.
    const expectedOrigin = new URL(request.url);
    expectedOrigin.host = request.headers.get("host") ?? expectedOrigin.host;
    if (request.headers.get("sec-fetch-site") === "cross-site" || origin && origin !== expectedOrigin.origin) {
      return denied(403, "Origen de la solicitud no permitido.");
    }
  }
  return null;
}

async function sameSecret(first: string, second: string) {
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(first)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(second)));
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

function denied(status: number, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { ...headers, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
