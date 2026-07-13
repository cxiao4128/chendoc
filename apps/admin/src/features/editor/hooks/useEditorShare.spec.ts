import { describe, expect, it } from "vitest";
import { createEditorSharePatch } from "./useEditorShare";

const pollutedForm = {
  enabled: true,
  password: "Account!Password123",
  customSlug: "account-admin",
  isAdmin: true,
};

describe("createEditorSharePatch", () => {
  it("does not persist browser-autofilled credentials during an automatic save", () => {
    expect(createEditorSharePatch(pollutedForm)).toEqual({ isEnabled: true });
  });

  it("persists a custom slug only after the explicit save action", () => {
    expect(createEditorSharePatch({
      ...pollutedForm,
      customSlug: "  public-doc  ",
      customSlugConfirmed: true,
    })).toEqual({ isEnabled: true, customSlug: "public-doc" });
  });

  it("never lets a non-admin persist a custom slug", () => {
    expect(createEditorSharePatch({
      ...pollutedForm,
      isAdmin: false,
      customSlugConfirmed: true,
    })).toEqual({ isEnabled: true });
  });

  it("persists a password only after confirmation", () => {
    expect(createEditorSharePatch({
      ...pollutedForm,
      password: "  Share!Password123  ",
      passwordConfirmed: true,
    })).toEqual({ isEnabled: true, password: "Share!Password123" });
  });

  it("clears a password only after the explicit clear action", () => {
    expect(createEditorSharePatch({
      ...pollutedForm,
      clearPassword: true,
    })).toEqual({ isEnabled: true, password: null });
  });
});
