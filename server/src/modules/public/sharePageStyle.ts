export const sharePageStyle = `
  @font-face {
    font-family: "AlibabaPuHuiTi";
    src: url("/fonts/AlibabaPuHuiTi-3-55-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "SourceHanSerif";
    src: url("/fonts/SourceHanSerifSC-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  :root {
    color-scheme: light;
    --bg: #ffffff;
    --text: #1f2329;
    --muted: #646a73;
    --border: #dee0e3;
    --soft: #f7f8fa;
    --accent: #245bdb;
    --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    --font-mono: "JetBrains Mono", Consolas, "SFMono-Regular", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-sans);
    line-height: 1.76;
    font-size: 16px;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    border-bottom: 1px solid var(--border);
    padding: 14px 32px;
    color: var(--muted);
    font-size: 13px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    color: var(--text);
    text-decoration: none;
    font-weight: 720;
  }
  .brand img {
    width: 28px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 7px;
    object-fit: cover;
  }
  .brand__name {
    color: var(--text);
  }
  main { max-width: 820px; margin: 0 auto; padding: 48px 0 88px; }
  header { border-bottom: 1px solid var(--border); margin-bottom: 32px; padding-bottom: 18px; }
  h1 { margin: 0; font-size: 36px; line-height: 1.22; font-weight: 760; letter-spacing: 0; }
  .lead { margin: 12px 0 0; color: var(--muted); font-size: 16px; }
  .content :where(h2,h3,h4) { margin: 32px 0 12px; line-height: 1.35; }
  .content :where(p,ul,ol,blockquote,pre,table,figure) { margin: 16px 0; }
  .content a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; }
  .content img, .content video { max-width: 100%; height: auto; border-radius: 6px; }
  .content table { width: 100%; border-collapse: collapse; display: block; overflow-x: auto; }
  .content th, .content td { border: 1px solid var(--border); padding: 8px 10px; }
  .content pre { overflow-x: auto; background: var(--soft); border: 1px solid var(--border); border-radius: 6px; padding: 14px; }
  .content code { font-family: var(--font-mono); }
  .empty { border: 1px solid var(--border); background: var(--soft); border-radius: 8px; padding: 22px; color: var(--muted); }
  .share-card { display: grid; gap: 16px; border: 1px solid var(--border); border-radius: 18px; background: var(--soft); padding: 22px; }
  .share-meta, .share-form { display: grid; gap: 10px; }
  .share-label { color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .share-url { color: var(--accent); font-weight: 650; overflow-wrap: anywhere; }
  .share-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
  .share-input {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
    color: var(--text);
    padding: 0 14px;
    font: inherit;
    outline: none;
  }
  .share-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(36, 91, 219, 0.12);
  }
  .share-button {
    min-height: 46px;
    border: 0;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    padding: 0 18px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .share-button:disabled { opacity: 0.72; cursor: wait; }
  .share-status { margin: 0; color: var(--muted); font-size: 14px; }
  .share-status.is-error { color: #c93f35; }
  @media (max-width: 900px) {
    main { width: 92%; }
    .topbar { padding: 12px 24px; }
  }
  @media (max-width: 560px) {
    main { width: 100%; padding: 32px 16px 64px; }
    h1 { font-size: 28px; }
    .topbar { padding: 12px 16px; }
    .share-row { grid-template-columns: 1fr; }
  }
`;
