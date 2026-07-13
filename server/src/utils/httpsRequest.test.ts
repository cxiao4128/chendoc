import { describe, expect, test } from "vitest";
import { httpsRedirectOrigin, isHttpsRequest, isLoopbackAddress } from "./httpsRequest.js";

describe("HTTPS reverse proxy detection", () => {
  test("accepts native HTTPS", () => {
    expect(isHttpsRequest({
      protocol: "https",
      forwardedProto: undefined,
      remoteAddress: "203.0.113.9",
      publicSiteUrl: "https://docs.example.com"
    })).toBe(true);
  });

  test("accepts an HTTPS public site behind a local BT/Nginx proxy without forwarded proto", () => {
    expect(isHttpsRequest({
      protocol: "http",
      forwardedProto: undefined,
      remoteAddress: "::ffff:127.0.0.1",
      publicSiteUrl: "https://docs.example.com"
    })).toBe(true);
  });

  test("honors an explicit HTTP forwarded protocol", () => {
    expect(isHttpsRequest({
      protocol: "http",
      forwardedProto: "http",
      remoteAddress: "127.0.0.1",
      publicSiteUrl: "https://docs.example.com"
    })).toBe(false);
  });

  test("does not trust a spoofed forwarded protocol from a remote client", () => {
    expect(isHttpsRequest({
      protocol: "http",
      forwardedProto: "https",
      remoteAddress: "203.0.113.9",
      publicSiteUrl: "https://docs.example.com"
    })).toBe(false);
  });

  test("recognizes IPv4 and IPv6 loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("192.0.2.1")).toBe(false);
  });

  test("keeps API HTTPS redirects on the configured API origin", () => {
    expect(httpsRedirectOrigin({
      requestUrl: "/api/health?probe=1",
      publicSiteUrl: "https://d.w92.pw",
      apiOrigin: "https://api.w92.pw",
    })).toBe("https://api.w92.pw");
    expect(httpsRedirectOrigin({
      requestUrl: "/r/111",
      publicSiteUrl: "https://d.w92.pw",
      apiOrigin: "https://api.w92.pw",
    })).toBe("https://d.w92.pw");
  });
});
