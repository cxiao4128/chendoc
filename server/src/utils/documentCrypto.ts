import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const EMPTY_DOCUMENT_JSON = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });
const EMPTY_DOCUMENT_HTML = "<p></p>";

export interface EncryptedField {
  ciphertext: string | null;
  iv: string | null;
  tag: string | null;
  keyVersion: string | null;
}

export interface EncryptedDocumentContent {
  contentJson: string;
  contentHtml: string;
  contentJsonCiphertext: string | null;
  contentJsonIv: string | null;
  contentJsonTag: string | null;
  contentJsonKeyVersion: string | null;
  contentHtmlCiphertext: string | null;
  contentHtmlIv: string | null;
  contentHtmlTag: string | null;
  contentHtmlKeyVersion: string | null;
}

export class DocumentDecryptionError extends Error {
  constructor(readonly keyVersion: string | null) {
    super(`Document decryption failed for key version ${keyVersion ?? "unknown"}.`);
    this.name = "DocumentDecryptionError";
  }
}

function configuredKeyring() {
  let previous: Record<string, string> = {};
  if (env.documentKeyring) {
    try {
      previous = JSON.parse(env.documentKeyring) as Record<string, string>;
    } catch {
      throw new Error("CHENDOC_DOCUMENT_KEYRING must be a JSON object.");
    }
  }
  return { ...previous, [env.documentKeyVersion]: env.documentEncryptionKey };
}

function documentKey(version = env.documentKeyVersion) {
  const secret = configuredKeyring()[version];
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new DocumentDecryptionError(version);
  }
  return createHash("sha256").update(secret).digest();
}

function encryptField(value: string): EncryptedField {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", documentKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: env.documentKeyVersion
  };
}

function decryptField(field: EncryptedField, fallback: string) {
  const present = [field.ciphertext, field.iv, field.tag].filter(Boolean).length;
  if (present === 0) return fallback;
  if (present !== 3) {
    console.error("SECURITY document_encryption_metadata_incomplete", { keyVersion: field.keyVersion ?? null });
    throw new DocumentDecryptionError(field.keyVersion);
  }
  const ciphertext = field.ciphertext!;
  const iv = field.iv!;
  const tag = field.tag!;
  try {
    const decipher = createDecipheriv("aes-256-gcm", documentKey(field.keyVersion ?? env.documentKeyVersion), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch (error) {
    console.error("SECURITY document_decryption_failed", { keyVersion: field.keyVersion ?? null });
    if (error instanceof DocumentDecryptionError) throw error;
    throw new DocumentDecryptionError(field.keyVersion);
  }
}

function normalizeDocumentJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return EMPTY_DOCUMENT_JSON;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown };
    return parsed && parsed.type === "doc" ? trimmed : EMPTY_DOCUMENT_JSON;
  } catch {
    return EMPTY_DOCUMENT_JSON;
  }
}

function normalizeDocumentHtml(value: string) {
  return value.trim() ? value : EMPTY_DOCUMENT_HTML;
}

export function encryptDocumentContent(contentJson: string, contentHtml: string): EncryptedDocumentContent {
  const json = encryptField(contentJson);
  const html = encryptField(contentHtml);
  return {
    contentJson: "",
    contentHtml: "",
    contentJsonCiphertext: json.ciphertext,
    contentJsonIv: json.iv,
    contentJsonTag: json.tag,
    contentJsonKeyVersion: json.keyVersion,
    contentHtmlCiphertext: html.ciphertext,
    contentHtmlIv: html.iv,
    contentHtmlTag: html.tag,
    contentHtmlKeyVersion: html.keyVersion
  };
}

export function decryptDocumentRecord<T extends {
  contentJson: string;
  contentHtml: string;
  contentJsonCiphertext?: string | null;
  contentJsonIv?: string | null;
  contentJsonTag?: string | null;
  contentJsonKeyVersion?: string | null;
  contentHtmlCiphertext?: string | null;
  contentHtmlIv?: string | null;
  contentHtmlTag?: string | null;
  contentHtmlKeyVersion?: string | null;
}>(record: T): T {
  const contentJson = decryptField({
    ciphertext: record.contentJsonCiphertext ?? null,
    iv: record.contentJsonIv ?? null,
    tag: record.contentJsonTag ?? null,
    keyVersion: record.contentJsonKeyVersion ?? null
  }, record.contentJson);
  const contentHtml = decryptField({
    ciphertext: record.contentHtmlCiphertext ?? null,
    iv: record.contentHtmlIv ?? null,
    tag: record.contentHtmlTag ?? null,
    keyVersion: record.contentHtmlKeyVersion ?? null
  }, record.contentHtml);

  return {
    ...record,
    contentJson: normalizeDocumentJson(contentJson),
    contentHtml: normalizeDocumentHtml(contentHtml)
  };
}
