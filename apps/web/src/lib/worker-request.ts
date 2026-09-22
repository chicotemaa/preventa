// Server-side only. Never forward the browser's Basic credentials to the worker.
export function workerFetch(input: string | URL, init: RequestInit = {}) {
  const secret = process.env.WORKER_API_SECRET;
  if ((!secret || secret.length < 32) && process.env.NODE_ENV === "production") {
    throw new Error("Falta WORKER_API_SECRET en el frontend servidor.");
  }
  if (process.env.NODE_ENV === "production") {
    const configured = process.env.WORKER_URL;
    const destination = new URL(input);
    if (!configured || destination.origin !== new URL(configured).origin) {
      throw new Error("WORKER_URL debe apuntar explicitamente al backend configurado.");
    }
    if (destination.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname)) {
      throw new Error("La conexion al worker requiere HTTPS.");
    }
  }
  const headers = new Headers(init.headers);
  if (secret) headers.set("Authorization", `Bearer ${secret}`);
  return fetch(input, { ...init, headers, redirect: "error" });
}
