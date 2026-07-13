import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const configuredPort = Number(process.env.CHENDOC_E2E_PORT ?? 8985);
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
  ? configuredPort
  : 8985;
const productionGateway = process.env.CHENDOC_E2E_PRODUCTION_GATEWAY === "true";
const secret = "e2e-secret-".padEnd(32, "x");
const root = process.cwd();
const env = {
  ...process.env,
  NODE_ENV: productionGateway ? "production" : "test",
  CHENDOC_E2E_TESTING: productionGateway ? "false" : "true",
  CHENDOC_SKIP_DOTENV: "true",
  HOST: "127.0.0.1",
  PORT: String(port),
  PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: "./.tmp/e2e-chendoc.sqlite",
  CHENDOC_ALLOW_SQLITE_RUNTIME: "true",
  CHENDOC_FORCE_HTTPS: "false",
  CHENDOC_REQUIRE_UPLOAD_SCAN: "false",
  JWT_SECRET: secret,
  CONFIG_ENCRYPTION_KEY: secret,
  RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret,
  CHENDOC_INIT_ADMIN: "1",
  CHENDOC_ALLOW_WEAK_ADMIN_PASSWORD: "true",
  DEFAULT_ADMIN_USERNAME: "e2eadmin",
  DEFAULT_ADMIN_PASSWORD: "E2e!Password123",
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET: "",
  R2_PUBLIC_URL: "",
  R2_ENDPOINT: ""
};

function runNpm(script: string) {
  const windows = process.platform === "win32";
  const executable = windows ? (process.env.ComSpec || "cmd.exe") : "npm";
  const args = windows ? ["/d", "/s", "/c", `npm.cmd run ${script}`] : ["run", script];
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`E2E setup failed: npm run ${script}`);
}

async function stopServer(server: ChildProcess) {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3_000))
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

export default async function globalSetup() {
  const databasePath = resolve(root, ".tmp/e2e-chendoc.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${databasePath}${suffix}`, { force: true });

  runNpm("db:migrate");
  runNpm("admin:init");
  runNpm(productionGateway ? "build" : "build:test");

  const server = spawn(process.execPath, ["server/dist/server.js"], {
    cwd: root,
    env,
    stdio: "inherit"
  });

  const deadline = Date.now() + 180_000;
  try {
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`E2E server exited with code ${server.exitCode}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/login`);
        if (response.ok) return () => stopServer(server);
      } catch {
        // Server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("E2E server startup timed out");
  } catch (error) {
    await stopServer(server);
    throw error;
  }
}
