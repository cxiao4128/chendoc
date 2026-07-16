import { afterEach, describe, expect, test, vi } from "vitest";
import { prepareUpload } from "./upload-preparation";
import { ftyp, jpegBytes, pngBytes, policy, webpBytes } from "./upload-preparation.fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("upload image preparation", () => {
  test("uses the HTMLImageElement fallback and trusts verified WebP bytes", async () => {
    const drawImage = vi.fn();
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return createElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: BlobCallback) => callback(new Blob([webpBytes], { type: "image/webp" }))
      } as unknown as HTMLCanvasElement;
    });
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("createImageBitmap", undefined);
    vi.stubGlobal("Image", class {
      naturalWidth = 1600;
      naturalHeight = 900;
      width = 1600;
      height = 900;
      decoding = "";
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    const prepared = await prepareUpload(new File([jpegBytes], "camera.jpeg", { type: "" }), policy);

    expect(prepared.kind).toBe("image");
    expect(prepared.detectedFormat).toBe("webp");
    expect(prepared.file.name).toBe("camera.webp");
    expect(prepared.file.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  test("does not label a PNG canvas fallback as WebP", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 200, height: 100, close: vi.fn() })));
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return createElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => callback(new Blob([pngBytes], { type: "image/png" }))
      } as unknown as HTMLCanvasElement;
    });

    const prepared = await prepareUpload(new File([jpegBytes], "wrong.png", { type: "image/x-png" }), policy);

    expect(prepared.detectedFormat).toBe("jpeg");
    expect(prepared.file.name).toBe("wrong.jpg");
    expect(prepared.file.type).toBe("image/jpeg");
  });

  test("keeps a GIF unchanged without invoking an image decoder", async () => {
    const decoder = vi.fn();
    vi.stubGlobal("createImageBitmap", decoder);
    const file = new File([new TextEncoder().encode("GIF89a-content")], "animated.jpg", { type: "image/jpeg" });

    const prepared = await prepareUpload(file, policy);

    expect(prepared.detectedFormat).toBe("gif");
    expect(prepared.file.name).toBe("animated.gif");
    expect(prepared.file.type).toBe("image/gif");
    expect(decoder).not.toHaveBeenCalled();
  });

  test("reports an actionable error when HEIC cannot be decoded", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("unsupported"); }));
    vi.stubGlobal("Image", class {
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = "";
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:heic") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

    await expect(prepareUpload(new File([ftyp("heic", "mif1")], "iphone.jpeg", { type: "image/jpeg" }), policy))
      .rejects.toThrow("当前浏览器无法转换 HEIC/HEIF 图片");
  });

  test("converts a decodable HEIC image to a verified JPEG when WebP encoding is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 900, close: vi.fn() })));
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return createElement(tagName);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, mimeType?: string) => {
          callback(mimeType === "image/jpeg"
            ? new Blob([jpegBytes], { type: "image/jpeg" })
            : new Blob([pngBytes], { type: "image/png" }));
        }
      } as unknown as HTMLCanvasElement;
    });

    const prepared = await prepareUpload(new File([ftyp("heic", "mif1")], "iphone.heic", { type: "image/heic" }), policy);

    expect(prepared.detectedFormat).toBe("jpeg");
    expect(prepared.file.name).toBe("iphone.jpg");
    expect(prepared.file.type).toBe("image/jpeg");
  });
});
