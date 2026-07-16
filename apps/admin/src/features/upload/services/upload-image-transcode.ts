import { readBlobBytes, sniffFileFormat, type DetectedFormat } from "./upload-format-detection";

function maxDimension(width: number, height: number, limit = 2400) {
  const ratio = Math.min(1, limit / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeWithHtmlImage(file: File): Promise<DecodedImage> {
  if (typeof URL.createObjectURL !== "function") throw new Error("浏览器无法读取此图片");
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("浏览器无法解码此图片"));
      image.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("图片尺寸无效");
    return {
      source: image,
      width,
      height,
      cleanup: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close()
      };
    } catch {
      // Safari may expose createImageBitmap but fail for camera formats. Use the native image decoder next.
    }
  }
  return decodeWithHtmlImage(file);
}

async function canvasToVerifiedBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number
) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
  if (!blob) return null;
  const detected = sniffFileFormat(await readBlobBytes(blob));
  const expected = mimeType === "image/webp" ? "webp" : "jpeg";
  return detected === expected ? blob : null;
}

export async function transcodeImage(file: File, sourceFormat: DetectedFormat) {
  const decoded = await decodeImage(file);
  try {
    const size = maxDimension(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片压缩");
    context.drawImage(decoded.source, 0, 0, size.width, size.height);

    const webp = await canvasToVerifiedBlob(canvas, "image/webp", 0.82);
    if (webp) return { blob: webp, format: "webp" as const, extension: ".webp", mimeType: "image/webp" };

    if (sourceFormat === "heif") {
      const jpeg = await canvasToVerifiedBlob(canvas, "image/jpeg", 0.88);
      if (jpeg) return { blob: jpeg, format: "jpeg" as const, extension: ".jpg", mimeType: "image/jpeg" };
    }
    return null;
  } finally {
    decoded.cleanup();
  }
}
