import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = await buildApp();

async function shutdown(signal: NodeJS.Signals) {
  try {
    app.log.info({ signal }, "ChenDoc shutting down");
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await app.listen({ host: env.host, port: env.port });
  app.log.info(`ChenDoc listening on ${env.host}:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
