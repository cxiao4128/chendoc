import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-packet-"));
const testSecret = "x".repeat(32);

process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_URL = join(tempDir, "chendoc.sqlite");
process.env.JWT_SECRET = testSecret;
process.env.CONFIG_ENCRYPTION_KEY = testSecret;
process.env.RSA_PRIVATE_KEY_ENCRYPTION_KEY = testSecret;
process.env.CHENDOC_DOCUMENT_ENCRYPTION_KEY = testSecret;
process.env.PUBLIC_SITE_URL = "http://127.0.0.1:8985";
process.env.DEFAULT_ADMIN_PASSWORD = "Test!Password123";

const { closeDatabase } = await import("../db/client.js");
const { GatewayPacketError, __testing, issueGatewayChallenge } = await import("./packet.js");
const { env } = await import("../config/env.js");
const { packGatewayReply, unpackGatewayRequest } = await import("./middleware.js");

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("gateway challenge replay protection", () => {
  test("accepts multi-letter form action codes", () => {
    expect(__testing.validGatewayActionShape("fm1")).toBe(true);
    expect(__testing.validGatewayActionShape("fm11")).toBe(true);
    expect(__testing.validGatewayActionShape("1fm")).toBe(false);
  });

  test("consumes a challenge exactly once", () => {
    const challenge = issueGatewayChallenge({ fingerprint: "test-fingerprint" });

    expect(() => __testing.consumeChallenge(challenge.nonce)).not.toThrow();
    expect(() => __testing.consumeChallenge(challenge.nonce)).toThrow(GatewayPacketError);
  });
});

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function decryptPackedResponse(encoded: string, key: Buffer) {
  const parts = encoded.split(".");
  expect(parts[0]).toBe("XCHEN");
  const raw = base64urlDecode(parts[2]);
  const decipher = createDecipheriv("aes-256-gcm", key, base64urlDecode(parts[1]));
  decipher.setAuthTag(raw.subarray(-16));
  return JSON.parse(Buffer.concat([
    decipher.update(raw.subarray(0, -16)),
    decipher.final()
  ]).toString("utf8")) as Record<string, unknown>;
}

describe("gateway response packet", () => {
  test("packs packeted API responses outside production", async () => {
    const headers: Record<string, string> = {};
    const reply = {
      statusCode: 200,
      header(name: string, value: string) {
        headers[name] = value;
        return reply;
      }
    };
    const aesKey = Buffer.alloc(32, 7);
    const payload = await packGatewayReply(
      {
        id: "req-test",
        url: "/api/gateway",
        headers: {},
        gatewayAesKey: aesKey
      } as never,
      reply as never,
      {
        token: "plain-token",
        user: { username: "xchen" },
        expiresAt: "2026-06-05T17:43:27.000Z"
      }
    );

    expect(typeof payload).toBe("string");
    expect(payload).not.toContain("plain-token");
    expect(payload).not.toContain("xchen");
    expect(headers["Content-Type"]).toBe("application/json; charset=utf-8");

    const encoded = JSON.parse(payload as string) as { data: string };
    expect(encoded.data).toMatch(/^XCHEN\./);
    const responsePacket = decryptPackedResponse(encoded.data, aesKey);
    expect(responsePacket.data).toMatchObject({
      token: "plain-token",
      user: { username: "xchen" }
    });
  });

  test.each(["/api/auth/login", "/api/auth/register"])("does not bypass packing for %s", async (url) => {
    const aesKey = Buffer.alloc(32, 9);
    const reply = {
      statusCode: 200,
      header() {
        return reply;
      }
    };
    const payload = await packGatewayReply(
      { id: "req-auth", url, headers: {}, gatewayAesKey: aesKey } as never,
      reply as never,
      { token: "plain-token" }
    );

    expect(typeof payload).toBe("string");
    expect(payload).not.toContain("plain-token");
  });
});

describe("gateway request enforcement", () => {
  test.each([
    ["GET", undefined],
    ["POST", { raw: true }],
    ["PUT", { raw: true }],
    ["PATCH", { raw: true }],
    ["DELETE", undefined]
  ])("requires a gateway packet for private %s requests", async (method, body) => {
    const originalNodeEnv = env.nodeEnv;
    env.nodeEnv = "production";
    let sent: unknown;
    const reply = {
      statusCode: 200,
      code(statusCode: number) {
        reply.statusCode = statusCode;
        return reply;
      },
      send(payload: unknown) {
        sent = payload;
        return payload;
      }
    };
    try {
      await unpackGatewayRequest({ method, url: "/api/docs/42", headers: {}, body } as never, reply as never);
      expect(reply.statusCode).toBe(400);
      expect(sent).toMatchObject({ code: "PACKET_REQUIRED" });
    } finally {
      env.nodeEnv = originalNodeEnv;
    }
  });

  test.each(["/api/auth/login", "/api/auth/register"])("requires a gateway packet for %s", async (url) => {
    const originalNodeEnv = env.nodeEnv;
    env.nodeEnv = "production";
    let sent: unknown;
    const reply = {
      statusCode: 200,
      code(statusCode: number) {
        reply.statusCode = statusCode;
        return reply;
      },
      send(payload: unknown) {
        sent = payload;
        return payload;
      }
    };
    try {
      await unpackGatewayRequest({ method: "POST", url, headers: {}, body: { raw: true } } as never, reply as never);
      expect(reply.statusCode).toBe(400);
      expect(sent).toMatchObject({ code: "PACKET_REQUIRED" });
    } finally {
      env.nodeEnv = originalNodeEnv;
    }
  });
});
