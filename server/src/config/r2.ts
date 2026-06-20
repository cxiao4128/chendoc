import { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "../modules/settings/settings.service.js";
import { env } from "./env.js";
import { measureRequestPhase } from "../utils/requestTiming.js";

export function getR2Endpoint(config: Pick<R2Config, "accountId" | "endpoint">) {
  return config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`;
}

export function getR2CorsAllowedOrigins() {
  try {
    return [new URL(env.publicSiteUrl).origin];
  } catch {
    throw new Error("PUBLIC_SITE_URL 必须是有效 URL，用于生成 R2 CORS AllowedOrigins");
  }
}

export function createR2Client(config: R2Config) {
  const client = new S3Client({
    region: config.region || "auto",
    endpoint: getR2Endpoint(config),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  });
  const send = client.send.bind(client);
  client.send = ((...args: Parameters<typeof client.send>) =>
    measureRequestPhase("r2", () => send(...args))) as typeof client.send;
  return client;
}
