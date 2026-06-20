#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENV_DEFAULTS } from "../server/src/config/env-defaults.ts";

const path = resolve(import.meta.dirname, "../.env.example");
const source = readFileSync(path, "utf8");
const next = source
  .replace(/# IDLE_TIMEOUT_MS:.*\r?\n/, `# IDLE_TIMEOUT_MS: 会话 idle 超时时间（毫秒），由 server/src/config/env-defaults.ts 生成\n`)
  .replace(/# IDLE_TIMEOUT_MS=\d+/, `# IDLE_TIMEOUT_MS=${ENV_DEFAULTS.IDLE_TIMEOUT_MS}`);

if (process.argv.includes("--check")) {
  if (source !== next) throw new Error(".env.example 与代码默认值不一致，请运行 npm run env:sync");
} else {
  writeFileSync(path, next);
}
