export type DetectedFormat =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "avif"
  | "heif"
  | "mp4"
  | "mov"
  | "m4v"
  | "webm"
  | "ogv"
  | "pdf"
  | "zip"
  | "ole"
  | "text"
  | "unknown";

const MIME_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/avif-sequence": "image/avif",
  "video/x-m4v": "video/mp4",
  "application/mp4": "video/mp4",
  "video/x-quicktime": "video/quicktime",
  "video/x-webm": "video/webm",
  "application/ogg": "video/ogg",
  "application/x-pdf": "application/pdf",
  "application/x-zip-compressed": "application/zip",
  "text/x-markdown": "text/markdown"
};

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9", "mp41", "mp42", "avc1", "dash", "msdh", "msix", "cmfc", "cmfs"]);
const M4V_BRANDS = new Set(["m4v ", "m4vh", "m4vp"]);

export function normalizeClientMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() || "";
  return MIME_ALIASES[normalized] ?? normalized;
}

export function extensionFromName(name: string) {
  return name.match(/\.[A-Za-z0-9]+$/)?.[0].toLowerCase() || "";
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function includesBytes(bytes: Uint8Array, sequence: number[]) {
  if (!sequence.length || sequence.length > bytes.length) return false;
  for (let offset = 0; offset <= bytes.length - sequence.length; offset += 1) {
    if (sequence.every((value, index) => bytes[offset + index] === value)) return true;
  }
  return false;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function readFtypBrands(bytes: Uint8Array) {
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return new Set<string>();
  const declaredSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  const boxSize = Math.min(bytes.length, declaredSize >= 16 ? declaredSize : bytes.length);
  const brands = new Set<string>([ascii(bytes, 8, 4).toLowerCase()]);
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.add(ascii(bytes, offset, 4).toLowerCase());
  }
  return brands;
}

function hasAnyBrand(brands: Set<string>, candidates: Set<string>) {
  return Array.from(brands).some((brand) => candidates.has(brand));
}

function readEbmlVint(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 4 && (first & mask) === 0) {
    length += 1;
    mask >>= 1;
  }
  if (length > 4 || offset + length > bytes.length) return null;
  let value = first & (mask - 1);
  for (let index = 1; index < length; index += 1) value = (value * 256) + bytes[offset + index]!;
  return { length, value };
}

function isWebm(bytes: Uint8Array) {
  if (!startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return false;
  const limit = Math.min(bytes.length - 2, 4096);
  for (let offset = 4; offset < limit; offset += 1) {
    if (bytes[offset] !== 0x42 || bytes[offset + 1] !== 0x82) continue;
    const size = readEbmlVint(bytes, offset + 2);
    if (!size || size.value > 16) continue;
    const valueOffset = offset + 2 + size.length;
    return ascii(bytes, valueOffset, size.value).toLowerCase() === "webm";
  }
  return false;
}

function isOggTheora(bytes: Uint8Array) {
  return startsWithBytes(bytes, [0x4f, 0x67, 0x67, 0x53])
    && includesBytes(bytes, [0x80, 0x74, 0x68, 0x65, 0x6f, 0x72, 0x61]);
}

function isZip(bytes: Uint8Array) {
  return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
    || startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08]);
}

export function zipMatchesOfficeExtension(bytes: Uint8Array, extension: string) {
  if (extension === ".zip") return true;
  const requiredDirectory = extension === ".docx" ? "word/" : extension === ".xlsx" ? "xl/" : "ppt/";
  return includesBytes(bytes, Array.from(new TextEncoder().encode("[Content_Types].xml")))
    && includesBytes(bytes, Array.from(new TextEncoder().encode(requiredDirectory)));
}

export function sniffFileFormat(bytes: Uint8Array, fileName = ""): DetectedFormat {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  const header = ascii(bytes, 0, Math.min(bytes.length, 12));
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "webp";
  if (startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return isWebm(bytes) ? "webm" : "unknown";
  if (header.startsWith("OggS")) return isOggTheora(bytes) ? "ogv" : "unknown";
  if (header.startsWith("%PDF-")) return "pdf";
  if (isZip(bytes)) return "zip";
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";

  const brands = readFtypBrands(bytes);
  if (brands.size) {
    if (brands.has("avif") || brands.has("avis")) return "avif";
    if (hasAnyBrand(brands, HEIF_BRANDS)) return "heif";
    if (brands.has("qt  ")) return "mov";
    if (hasAnyBrand(brands, M4V_BRANDS)) return "m4v";
    if (hasAnyBrand(brands, MP4_BRANDS)) {
      return extensionFromName(fileName) === ".m4v" ? "m4v" : "mp4";
    }
  }

  if (bytes.length && !bytes.includes(0)) return "text";
  return "unknown";
}

export async function readBlobBytes(blob: Blob, limit = 4096) {
  const sliced = blob.slice(0, limit);
  if (typeof sliced.arrayBuffer === "function") {
    return new Uint8Array(await sliced.arrayBuffer());
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取文件"));
    reader.readAsArrayBuffer(sliced);
  });
}
