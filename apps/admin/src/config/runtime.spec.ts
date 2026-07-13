import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl, backendFetch, backendUrl, publicUrl } from "./runtime";

beforeEach(() => {
  window.__CHENDOC_RUNTIME_CONFIG__ = { apiBaseUrl: "", publicBaseUrl: "" };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__CHENDOC_RUNTIME_CONFIG__;
});

describe("runtime deployment origins", () => {
  it("keeps the normal deployment on same-origin relative API paths", () => {
    expect(apiBaseUrl()).toBe("");
    expect(backendUrl("/api/health")).toBe("/api/health");
    expect(publicUrl("/r/111")).toBe(`${window.location.origin}/r/111`);
  });

  it("routes API and public pages to their configured backend origins", () => {
    window.__CHENDOC_RUNTIME_CONFIG__ = {
      apiBaseUrl: "https://api.example.com/",
      publicBaseUrl: "https://docs.example.com",
    };

    expect(backendUrl("/api/gateway")).toBe("https://api.example.com/api/gateway");
    expect(publicUrl("/r/111")).toBe("https://docs.example.com/r/111");
    expect(publicUrl("/f/form-id")).toBe("https://docs.example.com/f/form-id");
  });

  it("blocks placeholders, origin paths, and credential exfiltration", () => {
    window.__CHENDOC_RUNTIME_CONFIG__ = { apiBaseUrl: "__CHENDOC_API_BASE_URL__" };
    expect(() => backendUrl("/api/health")).toThrow("尚未配置");

    window.__CHENDOC_RUNTIME_CONFIG__ = { apiBaseUrl: "https://api.example.com/prefix" };
    expect(() => backendUrl("/api/health")).toThrow("只能填写站点来源");

    window.__CHENDOC_RUNTIME_CONFIG__ = { apiBaseUrl: "https://api.example.com" };
    expect(() => backendUrl("https://evil.example/api/gateway")).toThrow("拒绝向配置后端之外");
    expect(() => backendUrl("/r/111")).toThrow("API 路径无效");
  });

  it("forces credentialed fetches for the configured API origin", async () => {
    window.__CHENDOC_RUNTIME_CONFIG__ = { apiBaseUrl: "https://api.example.com" };
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await backendFetch("/api/health", { credentials: "omit", cache: "no-store" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/api/health", {
      credentials: "include",
      cache: "no-store",
    });
  });
});
