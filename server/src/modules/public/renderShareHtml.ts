import { escapeHtml } from "../../utils/sanitize.js";
import { sharePageStyle } from "./sharePageStyle.js";

function renderShareLayout(input: {
  title: string;
  description: string;
  body: string;
  siteName: string;
  logoUrl: string;
  canonicalUrl?: string;
  imageMeta?: string;
}) {
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description);
  const siteName = escapeHtml(input.siteName);
  const logoUrl = escapeHtml(input.logoUrl);
  const canonical = input.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">
  <meta property="og:url" content="${escapeHtml(input.canonicalUrl)}">`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - ${siteName}</title>
  <meta name="description" content="${description}">
  <link rel="preload" as="image" href="${logoUrl}">
  ${canonical}
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name" content="${siteName}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${input.imageMeta || ""}
  <style>${sharePageStyle}</style>
</head>
<body>
  <div class="topbar">
    <a class="brand" href="/" rel="noopener noreferrer"><img src="${logoUrl}" alt=""><span class="brand__name">${siteName}</span></a>
  </div>
  <main>
    ${input.body}
  </main>
</body>
</html>`;
}

export function renderShareHtml(input: {
  title: string;
  summary: string;
  coverUrl: string;
  contentHtml: string;
  shareUrl: string;
  siteName: string;
  logoUrl: string;
  updatedAt: Date;
}) {
  const title = escapeHtml(input.title);
  const summary = escapeHtml(input.summary || input.title);
  const coverUrl = input.coverUrl ? escapeHtml(input.coverUrl) : "";
  const imageMeta = coverUrl
    ? `<meta property="og:image" content="${coverUrl}">
  <meta name="twitter:image" content="${coverUrl}">`
    : "";

  return renderShareLayout({
    title: input.title,
    description: input.summary || input.title,
    siteName: input.siteName,
    logoUrl: input.logoUrl,
    canonicalUrl: input.shareUrl,
    imageMeta,
    body: `<header>
      <h1>${title}</h1>
    </header>
    <article class="content">${input.contentHtml || '<div class="empty">这篇文档还没有内容。</div>'}</article>`
  });
}

export function renderSharePasswordHtml(input: {
  title: string;
  shareKey: string;
  shareUrl: string;
  siteName: string;
  logoUrl: string;
  errorMessage?: string;
}) {
  const title = escapeHtml(input.title);
  const errorMessage = input.errorMessage ? escapeHtml(input.errorMessage) : "";
  const encodedShareKey = encodeURIComponent(input.shareKey);
  const shareUrl = escapeHtml(input.shareUrl);

  return renderShareLayout({
    title: input.title,
    description: "请输入访问密码以继续查看分享内容。",
    siteName: input.siteName,
    logoUrl: input.logoUrl,
    canonicalUrl: input.shareUrl,
    body: `<header>
      <h1>${title}</h1>
      <p class="lead">这个分享设置了访问密码，输入正确密码后即可继续查看。</p>
    </header>
    <section class="share-card">
      <div class="share-meta">
        <span class="share-label">分享链接</span>
        <a class="share-url" href="${shareUrl}">${shareUrl}</a>
      </div>
      <form class="share-form" data-share-form>
        <label>
          <span class="share-label">访问密码</span>
          <div class="share-row">
            <input class="share-input" data-share-password type="password" placeholder="请输入访问密码" autocomplete="current-password">
            <button class="share-button" type="submit">确认密码</button>
          </div>
        </label>
        <p class="share-status${errorMessage ? " is-error" : ""}" data-share-status>${errorMessage || "输入后会直接打开正文。"}</p>
      </form>
    </section>
    <script>
      const form = document.querySelector("[data-share-form]");
      const passwordInput = document.querySelector("[data-share-password]");
      const status = document.querySelector("[data-share-status]");
      const submitButton = form?.querySelector("button[type=\\"submit\\"]");
      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();

      function b2bytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
      }

      function b2ab(value) {
        const bytes = b2bytes(value);
        return bytes.buffer;
      }

      function ab2b(value) {
        const bytes = new Uint8Array(value);
        let binary = "";
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        return btoa(binary);
      }

      function pemToBuffer(value) {
        return b2ab(value.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(/\\s/g, ""));
      }

      function jsonToBase64(value) {
        return btoa(unescape(encodeURIComponent(JSON.stringify(value))));
      }

      function base64ToJson(value) {
        return JSON.parse(textDecoder.decode(b2bytes(value)));
      }

      async function loadChallenge() {
        const response = await fetch("/api/crypto/challenge", { cache: "no-store" });
        if (!response.ok) throw new Error("无法加载请求校验，请刷新后重试。");
        return response.json();
      }

      async function encryptGatewayBody(method, path, body) {
        const [keyResponse, challenge] = await Promise.all([
          fetch("/api/crypto/public-key", { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("无法加载加密密钥，请刷新后重试。");
            return response.json();
          }),
          loadChallenge()
        ]);
        const publicKey = await crypto.subtle.importKey(
          "spki",
          pemToBuffer(keyResponse.publicKey),
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"]
        );
        const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, textEncoder.encode(ab2b(aesKeyBytes.buffer)));
        const aesKey = await crypto.subtle.importKey("raw", aesKeyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
        const encryptedBody = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          aesKey,
          textEncoder.encode(JSON.stringify({ method, path, body }))
        );
        return {
          envelope: {
            data: jsonToBase64({
              v: "2.0",
              keyId: keyResponse.keyId,
              key: ab2b(encryptedKey),
              iv: ab2b(iv.buffer),
              challenge: challenge.nonce,
              timestamp: Date.now(),
              nonce: crypto.randomUUID(),
              body: ab2b(encryptedBody)
            })
          },
          key: aesKeyBytes
        };
      }

      async function decryptGatewayResponse(payload, key) {
        const encoded = payload?.data || payload?.p;
        if (!encoded) return payload;
        const packet = base64ToJson(encoded);
        if (packet?.v !== "2.0" || !packet.iv || !packet.body) return packet;
        const aesKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: b2ab(packet.iv), tagLength: 128 },
          aesKey,
          b2ab(packet.body)
        );
        const responsePacket = JSON.parse(textDecoder.decode(plaintext));
        if (responsePacket.code === 0) return responsePacket.data;
        throw new Error(responsePacket.message || "密码不正确，请重试。");
      }

      async function requestGateway(path, body) {
        const packed = await encryptGatewayBody("POST", path, body);
        const response = await fetch("/api/gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(packed.envelope)
        });
        const payload = await decryptGatewayResponse(await response.json(), packed.key);
        if (!response.ok) throw new Error(payload?.message || "密码不正确，请重试。");
        return payload;
      }

      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = passwordInput?.value.trim() || "";
        if (!password) {
          status.textContent = "请输入访问密码。";
          status.classList.add("is-error");
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "验证中...";
        }
        status.textContent = "正在验证密码...";
        status.classList.remove("is-error");

        try {
          const payload = await requestGateway("/api/public/r/${encodedShareKey}/verify-password", { password });
          if (!payload.ok || !payload.token) {
            throw new Error(payload?.message || "密码不正确，请重试。");
          }
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set("accessToken", payload.token);
          window.location.replace(nextUrl.toString());
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "密码校验失败，请稍后重试。";
          status.classList.add("is-error");
          if (passwordInput) passwordInput.focus();
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "确认密码";
          }
        }
      });
    </script>`
  });
}

export function renderShareUnavailableHtml(input: {
  title: string;
  message: string;
  siteName: string;
  logoUrl: string;
}) {
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);

  return renderShareLayout({
    title: input.title,
    description: input.message,
    siteName: input.siteName,
    logoUrl: input.logoUrl,
    body: `<header>
      <h1>${title}</h1>
      <p class="lead">当前这个分享链接暂时无法打开。</p>
    </header>
    <section class="share-card">
      <p class="share-status is-error">${message}</p>
    </section>`
  });
}
