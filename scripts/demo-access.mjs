import { randomBytes } from "node:crypto";
import { mkdir, open, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = new URL("../.demo/", import.meta.url);
const file = new URL("access.json", directory);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
try {
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({
      APP_ACCESS_USERNAME: "presentacion",
      APP_ACCESS_PASSWORD: randomBytes(32).toString("base64url"),
      WORKER_API_SECRET: randomBytes(32).toString("hex"),
    }, null, 2) + "\n");
  } finally { await handle.close(); }
  console.log("Credenciales nuevas creadas. No se modificaron .env ni entornos publicados.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Se conservan las credenciales existentes.");
}
await chmod(file, 0o600);
console.log(`Archivo privado: ${fileURLToPath(file)}`);
