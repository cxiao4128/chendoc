import type { UploadPolicy } from "../../../api/uploads";

export const policy: UploadPolicy = {
  image: {
    extensions: [".webp", ".gif", ".png", ".jpg", ".jpeg", ".avif"],
    mime: ["image/webp", "image/gif", "image/png", "image/jpeg", "image/avif"],
    mimeByExtension: {
      ".webp": ["image/webp"], ".gif": ["image/gif"], ".png": ["image/png"],
      ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"], ".avif": ["image/avif"]
    },
    maxMb: 20,
    maxBytes: 20 * 1024 * 1024
  },
  video: {
    extensions: [".mp4", ".webm", ".mov", ".m4v", ".ogv"],
    mime: ["video/mp4", "video/webm", "video/quicktime", "video/ogg"],
    mimeByExtension: {
      ".mp4": ["video/mp4"], ".webm": ["video/webm"], ".mov": ["video/quicktime"],
      ".m4v": ["video/mp4"], ".ogv": ["video/ogg"]
    },
    maxMb: 200,
    maxBytes: 200 * 1024 * 1024
  },
  file: {
    extensions: [".pdf", ".zip", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
    mime: ["application/pdf", "application/zip", "text/plain", "text/markdown"],
    mimeByExtension: {
      ".pdf": ["application/pdf"], ".zip": ["application/zip"], ".txt": ["text/plain"],
      ".md": ["text/markdown", "text/plain"], ".doc": ["application/msword"],
      ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ".xls": ["application/vnd.ms-excel"],
      ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ".ppt": ["application/vnd.ms-powerpoint"],
      ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]
    },
    maxMb: 50,
    maxBytes: 50 * 1024 * 1024
  }
};

export function bytes(text: string) {
  return Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0)));
}

export function ftyp(majorBrand: string, ...compatibleBrands: string[]) {
  const brands = [majorBrand, ...compatibleBrands];
  const result = new Uint8Array(16 + compatibleBrands.length * 4);
  new DataView(result.buffer).setUint32(0, result.length, false);
  result.set(bytes("ftyp"), 4);
  result.set(bytes(majorBrand), 8);
  result.set(brands.length ? [0, 0, 0, 0] : [], 12);
  compatibleBrands.forEach((brand, index) => result.set(bytes(brand), 16 + index * 4));
  return result;
}

export const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
export const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
export const webpBytes = Uint8Array.from([...bytes("RIFF"), 4, 0, 0, 0, ...bytes("WEBP"), 1]);
export const webmBytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, ...bytes("webm")]);
export const matroskaBytes = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x88, ...bytes("matroska")]);
export const theoraBytes = Uint8Array.from([...bytes("OggS"), 0, 0, 0x80, ...bytes("theora")]);
export const oggAudioBytes = Uint8Array.from([...bytes("OggS"), 0, 0, 0x01, ...bytes("vorbis")]);

export function zipBytes(...entries: string[]) {
  return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...bytes(entries.join("\0"))]);
}
