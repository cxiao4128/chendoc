import { escapeHtml } from "../../utils/sanitize.js";
import { sharePageStyle } from "./sharePageStyle.js";

function renderShareLayout(input: {
  title: string;
  description: string;
  body: string;
  canonicalUrl?: string;
  imageMeta?: string;
}) {
  const title = escapeHtml(input.title);
  const description = escapeHtml(input.description);
  const canonical = input.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">
  <meta property="og:url" content="${escapeHtml(input.canonicalUrl)}">`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - 陈书</title>
  <meta name="description" content="${description}">
  ${canonical}
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name" content="陈书">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${input.imageMeta || ""}
  <style>${sharePageStyle}</style>
</head>
<body>
  <div class="topbar">
    <a class="brand" href="/" rel="noopener noreferrer"><span>陈</span> 陈书 / ChenDoc</a>
    <span>公开分享</span>
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
  errorMessage?: string;
}) {
  const title = escapeHtml(input.title);
  const errorMessage = input.errorMessage ? escapeHtml(input.errorMessage) : "";
  const encodedShareKey = encodeURIComponent(input.shareKey);
  const shareUrl = escapeHtml(input.shareUrl);

  return renderShareLayout({
    title: input.title,
    description: "请输入访问密码以继续查看分享内容。",
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
          const response = await fetch("/api/public/r/${encodedShareKey}/verify-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
          });
          const payload = await response.json();
          if (!response.ok || !payload.ok || !payload.token) {
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
}) {
  const title = escapeHtml(input.title);
  const message = escapeHtml(input.message);

  return renderShareLayout({
    title: input.title,
    description: input.message,
    body: `<header>
      <h1>${title}</h1>
      <p class="lead">当前这个分享链接暂时无法打开。</p>
    </header>
    <section class="share-card">
      <p class="share-status is-error">${message}</p>
    </section>`
  });
}
