import { describe, expect, test, vi } from "vitest";
import { normalizeClientMimeType, prepareUpload, sniffFileFormat } from "./upload-preparation";
import {
  bytes,
  ftyp,
  matroskaBytes,
  oggAudioBytes,
  policy,
  theoraBytes,
  webmBytes,
  zipBytes
} from "./upload-preparation.fixtures";

describe("upload preparation", () => {
  test.each([
    [ftyp("isom", "mp42"), "clip.mov", "video/x-quicktime", ".mp4", "video/mp4", "mp4"],
    [ftyp("qt  "), "clip.mp4", "video/mp4", ".mov", "video/quicktime", "mov"],
    [ftyp("M4V "), "clip.dat", "", ".m4v", "video/mp4", "m4v"],
    [webmBytes, "clip.mp4", "application/octet-stream", ".webm", "video/webm", "webm"],
    [theoraBytes, "clip.dat", "application/ogg", ".ogv", "video/ogg", "ogv"]
  ])("corrects video container MIME and extension from bytes", async (content, name, type, extension, mimeType, format) => {
    const prepared = await prepareUpload(new File([content], name, { type }), policy);
    expect(prepared.kind).toBe("video");
    expect(prepared.extension).toBe(extension);
    expect(prepared.mimeType).toBe(mimeType);
    expect(prepared.detectedFormat).toBe(format);
    expect(prepared.file.name.endsWith(extension)).toBe(true);
  });

  test("normalizes common MIME aliases and detects AVIF through compatible brands", () => {
    expect(normalizeClientMimeType(" IMAGE/PJPEG; charset=binary ")).toBe("image/jpeg");
    expect(normalizeClientMimeType("application/x-zip-compressed")).toBe("application/zip");
    expect(sniffFileFormat(ftyp("mif1", "avif"), "photo.heic")).toBe("avif");
  });

  test.each(["payload.svg", "payload.html", "payload.js", "payload.sh"])("rejects dangerous textual source extension %s", async (name) => {
    await expect(prepareUpload(new File([bytes("alert('unsafe')")], name, { type: "text/plain" }), policy))
      .rejects.toThrow("不允许上传");
  });

  test.each(["payload.jar", "payload.apk"])("rejects dangerous ZIP source extension %s", async (name) => {
    await expect(prepareUpload(new File([zipBytes("META-INF/MANIFEST.MF")], name, { type: "application/zip" }), policy))
      .rejects.toThrow("不允许上传");
  });

  test.each(["notes.csv", "notes.log", "notes"])("does not relabel unsupported text source %s as .txt", async (name) => {
    await expect(prepareUpload(new File([bytes("plain text")], name, { type: "text/plain" }), policy))
      .rejects.toThrow("文本附件仅支持 .txt 和 .md");
  });

  test.each(["archive.rar", "archive.7z", "archive.tar"])("does not relabel unsupported ZIP source %s as .zip", async (name) => {
    await expect(prepareUpload(new File([zipBytes("payload.bin")], name, { type: "application/zip" }), policy))
      .rejects.toThrow("压缩或 Office 附件仅支持");
  });

  test.each([
    ["notes.txt", "text/plain", "text"],
    ["notes.md", "text/x-markdown", "text"],
    ["archive.zip", "application/x-zip-compressed", "zip"],
    ["document.docx", "", "zip"]
  ])("keeps supported text and ZIP-family source %s", async (name, type, format) => {
    const content = format === "zip"
      ? name.endsWith(".docx")
        ? zipBytes("[Content_Types].xml", "word/document.xml")
        : zipBytes("archive.txt")
      : bytes("plain text");
    const prepared = await prepareUpload(new File([content], name, { type }), policy);
    expect(prepared.kind).toBe("file");
    expect(prepared.detectedFormat).toBe(format);
    expect(prepared.file.name).toBe(name);
  });

  test.each([
    [matroskaBytes, "movie.webm"],
    [oggAudioBytes, "audio.ogv"]
  ])("rejects a non-video container instead of auto-correcting it", async (content, name) => {
    await expect(prepareUpload(new File([content], name, { type: "video/webm" }), policy))
      .rejects.toThrow("无法识别文件真实格式");
  });

  test("rejects a JAR container renamed to .docx", async () => {
    await expect(prepareUpload(new File([zipBytes("META-INF/MANIFEST.MF", "payload.class")], "payload.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }), policy)).rejects.toThrow("文件内容与 Office 后缀不匹配");
  });

  test("reads magic bytes through FileReader when Blob.arrayBuffer is unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "arrayBuffer");
    Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value: undefined });
    const readAsArrayBuffer = vi.spyOn(FileReader.prototype, "readAsArrayBuffer");
    try {
      const prepared = await prepareUpload(new File([bytes("GIF89a-content")], "animated.gif", { type: "" }), policy);
      expect(prepared.detectedFormat).toBe("gif");
      expect(readAsArrayBuffer).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      if (descriptor) Object.defineProperty(Blob.prototype, "arrayBuffer", descriptor);
      else Reflect.deleteProperty(Blob.prototype, "arrayBuffer");
    }
  });
});
