import { beforeEach, describe, expect, test, vi } from "vitest";
import { gatewayClientRequest } from "@/gateway/client";
import {
  getPublicShareApi,
  getPublicShareSiteConfigApi,
  PublicShareApiError,
  verifyPublicSharePasswordApi
} from "./public-share.api";

vi.mock("@/gateway/client", () => ({
  gatewayClientRequest: vi.fn()
}));

const gatewayRequest = vi.mocked(gatewayClientRequest);

describe("public share API adapter", () => {
  beforeEach(() => {
    gatewayRequest.mockReset();
  });

  test("loads a public share through the existing p3 gateway mapping", async () => {
    const payload = {
      doc: { title: "公开正文", contentHtml: "<p>正文</p>", updatedAt: "2026-07-12T00:00:00.000Z" },
      share: { shareId: 111, viewCount: 0 },
      protected: false,
      unlocked: true
    };
    gatewayRequest.mockResolvedValue({ response: new Response(null, { status: 200 }), payload });

    await expect(getPublicShareApi("my doc", "share-token")).resolves.toEqual(payload);

    const [url, options, headers] = gatewayRequest.mock.calls[0]!;
    expect(url).toBe("/api/public/r/my%20doc");
    expect(options).toMatchObject({ method: "GET", cache: "no-store" });
    expect(headers.get("Authorization")).toBe("Bearer share-token");
  });

  test("verifies the password through the existing p2 gateway mapping", async () => {
    gatewayRequest.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      payload: { ok: true, token: "share-token" }
    });

    await expect(verifyPublicSharePasswordApi("111", "correct horse")).resolves.toEqual({
      ok: true,
      token: "share-token"
    });

    const [url, options, headers] = gatewayRequest.mock.calls[0]!;
    expect(url).toBe("/api/public/r/111/verify-password");
    expect(options.body).toBe(JSON.stringify({ password: "correct horse" }));
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.has("Authorization")).toBe(false);
  });

  test("loads public branding through the existing p1 gateway mapping", async () => {
    const payload = { config: { shortName: "陈书" } };
    gatewayRequest.mockResolvedValue({ response: new Response(null, { status: 200 }), payload });

    await expect(getPublicShareSiteConfigApi()).resolves.toEqual(payload);

    const [url, options, headers] = gatewayRequest.mock.calls[0]!;
    expect(url).toBe("/api/public/settings/site");
    expect(options).toMatchObject({ method: "GET", cache: "no-store" });
    expect(headers.has("Authorization")).toBe(false);
  });

  test("keeps backend status and safe message for unavailable shares", async () => {
    gatewayRequest.mockResolvedValue({
      response: new Response(null, { status: 404 }),
      payload: { code: "NOT_FOUND", message: "分享不存在或已关闭" }
    });

    const error = await getPublicShareApi("111").catch((caught) => caught);
    expect(error).toBeInstanceOf(PublicShareApiError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "分享不存在或已关闭" });
  });
});
