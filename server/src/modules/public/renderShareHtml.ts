import { escapeHtml, sanitizeDocumentHtml } from "../../utils/sanitize.js";
import { sharePageStyle } from "./sharePageStyle.js";

function renderShareLayout(input: {
  title: string;
  description: string;
  body: string;
  siteName: string;
  logoUrl: string;
  canonicalUrl?: string;
  imageMeta?: string;
  scriptNonce?: string;
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
  const contentHtml = input.contentHtml ? sanitizeDocumentHtml(input.contentHtml) : "";
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
      <p class="share-kicker">ChenDoc</p>
      <h1>${title}</h1>
      <p class="lead">${escapeHtml(input.siteName)} · ${escapeHtml(input.updatedAt.toLocaleString("zh-CN"))}</p>
    </header>
    <article class="content">${contentHtml || '<div class="empty">这篇文档还没有内容。</div>'}</article>`
  });
}

export function renderSharePasswordHtml(input: {
  title: string;
  shareKey: string;
  shareUrl: string;
  siteName: string;
  logoUrl: string;
  scriptNonce?: string;
  errorMessage?: string;
}) {
  const title = escapeHtml(input.title);
  const errorMessage = input.errorMessage ? escapeHtml(input.errorMessage) : "";
  const encodedShareKey = encodeURIComponent(input.shareKey);
  const shareUrl = escapeHtml(input.shareUrl);
  const scriptNonceAttr = input.scriptNonce ? ` nonce="${escapeHtml(input.scriptNonce)}"` : "";

  return renderShareLayout({
    title: input.title,
    description: "访问密码",
    siteName: input.siteName,
    logoUrl: input.logoUrl,
    canonicalUrl: input.shareUrl,
    scriptNonce: input.scriptNonce,
    body: `<header>
      <p class="share-kicker">ChenDoc</p>
      <h1>${title}</h1>
      <p class="lead">访问密码</p>
    </header>
    <section class="share-card" data-share-card>
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
        <p class="share-status${errorMessage ? " is-error" : ""}" data-share-status>${errorMessage || ""}</p>
      </form>
    </section>
    <article class="content" data-share-content hidden></article>
    <script${scriptNonceAttr}>
      const form = document.querySelector("[data-share-form]");
      const passwordInput = document.querySelector("[data-share-password]");
      const status = document.querySelector("[data-share-status]");
      const submitButton = form?.querySelector("button[type=\\"submit\\"]");
      const content = document.querySelector("[data-share-content]");
      const card = document.querySelector("[data-share-card]");
      const textEncoder = new TextEncoder();
      const textDecoder = new TextDecoder();
      let fingerprintCache = "";

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

      function b2u(value) {
        return value.replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      }

      function u2b(value) {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        return normalized + (normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4)));
      }

      function ab2u(value) {
        return b2u(ab2b(value));
      }

      function u2ab(value) {
        return b2ab(u2b(value));
      }

      async function fingerprint() {
        if (fingerprintCache) return fingerprintCache;
        const source = [
          navigator.userAgent,
          navigator.language,
          navigator.platform,
          screen.width + "x" + screen.height + "x" + screen.colorDepth,
          Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        ].join("|");
        fingerprintCache = ab2u(await crypto.subtle.digest("SHA-256", textEncoder.encode(source)));
        return fingerprintCache;
      }

      async function loadChallenge(action) {
        const response = await fetch("/api/crypto/challenge?action=" + encodeURIComponent(action), {
          cache: "no-store",
          headers: { "X-Client-Fingerprint": await fingerprint() }
        });
        if (!response.ok) throw new Error("无法加载请求校验，请刷新后重试。");
        return response.json();
      }

      async function encryptBytes(publicKey, bytes) {
        const encrypted = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, textEncoder.encode(ab2b(bytes.buffer)));
        return ab2u(encrypted);
      }

      async function encryptAes(keyBytes, value) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const aesKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
        const encryptedBody = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          aesKey,
          textEncoder.encode(JSON.stringify(value || {}))
        );
        return { iv: ab2u(iv.buffer), body: ab2u(encryptedBody) };
      }

      async function hmac(keyBytes, value) {
        const hmacKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        return ab2u(await crypto.subtle.sign("HMAC", hmacKey, textEncoder.encode(value)));
      }

      async function encryptGatewayBody(action, payload) {
        const [keyResponse, challenge] = await Promise.all([
          fetch("/api/crypto/public-key", { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("无法加载加密密钥，请刷新后重试。");
            return response.json();
          }),
          loadChallenge(action)
        ]);
        const publicKey = await crypto.subtle.importKey(
          "spki",
          pemToBuffer(keyResponse.publicKey),
          { name: "RSA-OAEP", hash: "SHA-256" },
          false,
          ["encrypt"]
        );
        const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const encryptedKey = await encryptBytes(publicKey, aesKeyBytes);
        const encryptedBody = await encryptAes(aesKeyBytes, payload);
        const timestamp = Date.now();
        const nonce = crypto.randomUUID();
        const challengeNonce = challenge.nonce;
        const packet = {
          v: "xchen",
          keyId: keyResponse.keyId,
          key: encryptedKey,
          iv: encryptedBody.iv,
          challenge: challengeNonce,
          timestamp,
          nonce,
          fingerprint: await fingerprint(),
          action,
          body: encryptedBody.body,
          signature: await hmac(aesKeyBytes, [action, String(timestamp), nonce, encryptedBody.body, challengeNonce].join("\\n"))
        };
        const outerKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const encryptedOuterKey = await encryptBytes(publicKey, outerKeyBytes);
        const encryptedPacket = await encryptAes(outerKeyBytes, packet);
        return {
          envelope: {
            data: ["chendoc", keyResponse.keyId, encryptedOuterKey, encryptedPacket.iv, encryptedPacket.body].join(".")
          },
          key: aesKeyBytes
        };
      }

      async function decryptGatewayResponse(payload, key) {
        const encoded = payload?.data;
        if (!encoded) return payload;
        const parts = encoded.split(".");
        if (parts.length !== 3 || parts[0] !== "XCHEN") return payload;
        const aesKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
        const plaintext = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: u2ab(parts[1]), tagLength: 128 },
          aesKey,
          u2ab(parts[2])
        );
        const responsePacket = JSON.parse(textDecoder.decode(plaintext));
        if (responsePacket.code === 0) return responsePacket.data;
        throw new Error(responsePacket.message || "密码不正确，请重试。");
      }

      async function requestGateway(action, requestPayload, authToken) {
        const packed = await encryptGatewayBody(action, requestPayload);
        const headers = { "Content-Type": "application/json" };
        headers["X-Client-Fingerprint"] = await fingerprint();
        if (authToken) headers.Authorization = "Bearer " + authToken;
        const response = await fetch("/api/gateway", {
          method: "POST",
          headers,
          body: JSON.stringify(packed.envelope)
        });
        const responsePayload = await decryptGatewayResponse(await response.json(), packed.key);
        if (!response.ok) throw new Error(responsePayload?.message || "密码不正确，请重试。");
        return responsePayload;
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
          const payload = await requestGateway("p2", { params: { shareKey: "${encodedShareKey}" }, body: { password } });
          if (!payload.ok || !payload.token) {
            throw new Error(payload?.message || "密码不正确，请重试。");
          }
          const unlocked = await requestGateway("p3", { params: { shareKey: "${encodedShareKey}" } }, payload.token);
          if (!unlocked?.doc?.contentHtml) throw new Error("正文加载失败，请刷新后重试。");
          if (content) {
            content.innerHTML = unlocked.doc.contentHtml;
            content.hidden = false;
          }
          if (card) card.remove();
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
      <p class="share-kicker">ChenDoc</p>
      <h1>${title}</h1>
      <p class="lead">无法打开</p>
    </header>
    <section class="share-card">
      <p class="share-status is-error">${message}</p>
    </section>`
  });
}
