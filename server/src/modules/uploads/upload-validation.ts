import { extname } from "node:path";

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

const DANGEROUS_EMBEDDED_EXTENSIONS = new Set([
  "apk", "app", "bat", "bash", "bin", "cmd", "com", "cpl", "dll", "dmg", "exe", "gadget",
  "hta", "htm", "html", "jar", "js", "jse", "mjs", "msi", "msp", "phtml", "php", "ps1",
  "psm1", "scr", "sh", "svg", "svgz", "vb", "vbe", "vbs", "wsf", "wsh"
]);

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9", "mp41", "mp42", "avc1", "dash", "msdh", "msix", "cmfc", "cmfs"]);
const M4V_BRANDS = new Set(["m4v ", "m4vh", "m4vp"]);

export function normalizeUploadMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase() || "";
  return MIME_ALIASES[normalized] ?? normalized;
}

export function hasDangerousDoubleExtension(fileName: string) {
  const leafName = fileName.split(/[\\/]/).at(-1)?.toLowerCase() || "";
  const segments = leafName.split(".");
  if (segments.length < 3) return false;
  return segments.slice(1, -1).some((segment) => DANGEROUS_EMBEDDED_EXTENSIONS.has(segment));
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
  return Buffer.from(bytes.slice(start, start + length)).toString("ascii");
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

function zipMatchesOfficeExtension(bytes: Uint8Array, extension: string) {
  const requiredDirectory = extension === ".docx" ? "word/" : extension === ".xlsx" ? "xl/" : "ppt/";
  return includesBytes(bytes, Array.from(Buffer.from("[Content_Types].xml", "ascii")))
    && includesBytes(bytes, Array.from(Buffer.from(requiredDirectory, "ascii")));
}

type IsoFormat = "avif" | "heif" | "mov" | "m4v" | "mp4" | "unknown";

function detectIsoFormat(bytes: Uint8Array): IsoFormat {
  const brands = readFtypBrands(bytes);
  if (!brands.size) return "unknown";
  if (brands.has("avif") || brands.has("avis")) return "avif";
  if (hasAnyBrand(brands, HEIF_BRANDS)) return "heif";
  if (brands.has("qt  ")) return "mov";
  if (hasAnyBrand(brands, M4V_BRANDS)) return "m4v";
  if (hasAnyBrand(brands, MP4_BRANDS)) return "mp4";
  return "unknown";
}

export function contentMatchesExtension(fileName: string, bytes: Uint8Array) {
  const ext = extname(fileName).toLowerCase();
  const text = ascii(bytes, 0, Math.min(bytes.length, 12));
  if (ext === ".png") return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (ext === ".jpg" || ext === ".jpeg") return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  if (ext === ".gif") return text.startsWith("GIF87a") || text.startsWith("GIF89a");
  if (ext === ".webp") return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  if (ext === ".avif") return detectIsoFormat(bytes) === "avif";
  if (ext === ".pdf") return text.startsWith("%PDF-");
  if (ext === ".zip") return isZip(bytes);
  if ([".docx", ".xlsx", ".pptx"].includes(ext)) return isZip(bytes) && zipMatchesOfficeExtension(bytes, ext);
  if ([".doc", ".xls", ".ppt"].includes(ext)) {
    return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  const isoFormat = detectIsoFormat(bytes);
  if (ext === ".mp4") return isoFormat === "mp4" || isoFormat === "m4v";
  if (ext === ".mov") return isoFormat === "mov";
  if (ext === ".m4v") return isoFormat === "m4v" || isoFormat === "mp4";
  if (ext === ".webm") return isWebm(bytes);
  if (ext === ".ogv") return isOggTheora(bytes);
  if (ext === ".txt" || ext === ".md") return bytes.length > 0 && !bytes.includes(0);
  return false;
}
