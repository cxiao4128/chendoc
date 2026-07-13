import { describe, expect, test, vi } from "vitest";
import router from "./index";

vi.mock("../stores/auth", () => ({
  useAuthStore: () => {
    throw new Error("public share route must not bootstrap the admin session");
  }
}));

describe("public share route", () => {
  test("is lazy and bypasses the signed-in admin redirect", async () => {
    const resolved = router.resolve("/r/111");
    expect(resolved.meta.publicShare).toBe(true);
    expect(typeof resolved.matched[0]?.components?.default).toBe("function");

    await expect(router.push("/r/111")).resolves.toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe("/r/111");
  });
});
