import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "apps/admin/dist");
const target = resolve(root, "server/public/admin");

if (!existsSync(source)) {
  throw new Error("Admin dist not found. Run npm --prefix apps/admin run build first.");
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Admin assets copied to server/public/admin");
