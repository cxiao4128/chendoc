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

function documentKey() {
  return createHash("sha256").update(env.documentEncryptionKey).digest();
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
  if (!field.ciphertext || !field.iv || !field.tag) return fallback;
  try {
    const decipher = createDecipheriv("aes-256-gcm", documentKey(), Buffer.from(field.iv, "base64"));
    decipher.setAuthTag(Buffer.from(field.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(field.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return fallback;
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
