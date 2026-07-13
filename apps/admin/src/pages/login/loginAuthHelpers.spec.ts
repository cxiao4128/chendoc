import { describe, expect, it } from "vitest";
import { loginErrorMessage, loginFailureText } from "./loginAuthHelpers";

describe("login error copy", () => {
  it("explains that encrypted login needs HTTPS", () => {
    const error = Object.assign(new Error("technical detail"), { code: "WEB_CRYPTO_UNAVAILABLE" });
    expect(loginFailureText(loginErrorMessage(error, false))).toBe(
      "登录失败：当前地址不支持安全登录，请使用 HTTPS 地址。"
    );
  });

  it("does not expose unexpected runtime errors", () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'digest')");
    expect(loginFailureText(loginErrorMessage(error, false))).toBe(
      "登录失败：暂时无法登录，请刷新后重试。"
    );
  });
});
