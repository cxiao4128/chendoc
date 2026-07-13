import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { registerAdminCors } from "./admin-cors.js";

const adminOrigin = "https://admin.example.com";
const app = Fastify();

registerAdminCors(app, [adminOrigin]);
app.get("/api/ping", async () => ({ ok: true }));
app.post("/api/gateway", async () => ({ ok: true }));

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("admin API CORS", () => {
  test("answers an allowed gateway preflight before route handling", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/gateway",
      headers: {
        origin: adminOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type, x-client-fingerprint, x-client-risk",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(response.headers["access-control-allow-origin"]).toBe(adminOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("x-client-fingerprint");
    expect(response.headers.vary).toContain("Origin");
  });

  test("adds credentials headers to an allowed API response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/ping",
      headers: { origin: adminOrigin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(adminOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("rejects untrusted and opaque origins", async () => {
    for (const origin of ["https://evil.example", "null"]) {
      const response = await app.inject({ method: "GET", url: "/api/ping", headers: { origin } });
      expect(response.statusCode).toBe(403);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  test("keeps normal same-origin requests working without Origin", async () => {
    const response = await app.inject({ method: "GET", url: "/api/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  test("accepts the request host as a normal same-origin origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/ping",
      headers: { host: "localhost:8985", origin: "http://localhost:8985" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:8985");
  });
});
