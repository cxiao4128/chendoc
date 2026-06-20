export const sharePageStyle = `
  :root {
    color-scheme: light;
    --bg: #f6f8fb;
    --paper: #ffffff;
    --paper-soft: #f8fafc;
    --ink: #0f172a;
    --text: #1e293b;
    --muted: #64748b;
    --border: #dbe4f0;
    --border-strong: #afbdd0;
    --accent: #2563eb;
    --accent-dark: #1d4ed8;
    --accent-soft: #eaf2ff;
    --success: #059669;
    --success-soft: #e9f8f1;
    --danger: #dc2626;
    --font-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    --font-serif: "Songti SC", "STSong", "SimSun", serif;
    --font-mono: Consolas, "SFMono-Regular", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-sans);
    line-height: 1.78;
    font-size: 16px;
  }
  ::selection { background: rgba(37, 99, 235, 0.18); color: var(--ink); }
  /* ===== 分享页秒开优化：内容骨架屏渲染 ===== */
  .content {
    min-width: 0;
    min-height: 200px;
    overflow-wrap: anywhere;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    border-bottom: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(14px) saturate(126%);
    padding: 14px clamp(18px, 4vw, 42px);
    color: var(--muted);
    font-size: 13px;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    text-decoration: none;
    font-weight: 800;
  }
  .brand img {
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--paper);
    object-fit: cover;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
  }
  .brand__name {
    color: var(--ink);
    font-size: 19px;
    font-weight: 900;
  }
  main {
    width: min(920px, calc(100% - 32px));
    margin: 0 auto;
    padding: 56px 0 96px;
  }
  header {
    position: relative;
    margin-bottom: 30px;
    border-bottom: 1px solid var(--border);
    padding: 0 0 26px;
  }
  .share-kicker {
    width: fit-content;
    margin: 0 0 12px;
    color: var(--accent-dark);
    font-size: 12px;
    font-weight: 900;
  }
  h1 {
    max-width: 13em;
    margin: 0;
    color: var(--ink);
    font-size: 46px;
    font-weight: 900;
    line-height: 1.12;
    letter-spacing: 0;
  }
  .lead { margin: 14px 0 0; color: var(--muted); font-size: 16px; }
  .content {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--paper);
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.06);
    padding: clamp(26px, 5vw, 56px);
    font-family: var(--font-serif);
  }
  .content :where(h2,h3,h4) { margin: 34px 0 12px; color: var(--ink); line-height: 1.35; font-weight: 800; }
  .content h2 { font-size: 28px; }
  .content h3 { font-size: 22px; }
  .content :where(p,ul,ol,blockquote,pre,table,figure) { margin: 16px 0; }
  .content a {
    color: var(--accent-dark);
    overflow-wrap: anywhere;
    word-break: break-word;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .content blockquote {
    border-left: 3px solid var(--accent);
    background: var(--accent-soft);
    margin-left: 0;
    padding: 10px 14px;
    color: var(--text);
  }
  .content img, .content video { max-width: 100%; height: auto; border-radius: 8px; }
  .content table { width: 100%; border-collapse: collapse; display: block; overflow-x: auto; }
  .content th, .content td { border: 1px solid var(--border); padding: 8px 10px; }
  .content th { background: var(--accent-soft); }
  .content pre { overflow-x: auto; background: #111827; color: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
  .content code { font-family: var(--font-mono); }
  .empty { border: 1px solid var(--border); background: var(--paper-soft); border-radius: 8px; padding: 22px; color: var(--muted); }
  .share-native-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 18px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--paper-soft);
    padding: 14px 16px;
    font-family: var(--font-sans);
  }
  .share-native-info__label {
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--success-soft);
    color: var(--success);
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.2;
  }
  .share-native-info p {
    min-width: 0;
    margin: 0;
    color: var(--text);
    font-size: 15px;
    font-weight: 800;
    line-height: 1.6;
    text-align: right;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .share-card {
    display: grid;
    gap: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--paper);
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.08);
    padding: clamp(22px, 4vw, 34px);
  }
  .share-meta, .share-form { display: grid; gap: 10px; }
  .share-label { color: var(--muted); font-size: 12px; font-weight: 800; }
  .share-url { color: var(--accent-dark); font-weight: 700; overflow-wrap: anywhere; }
  .share-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
  .share-input {
    width: 100%;
    min-height: 46px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--paper-soft);
    color: var(--text);
    padding: 0 14px;
    font: inherit;
    outline: none;
  }
  .share-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
  }
  .share-button {
    min-height: 46px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--accent);
    color: #ffffff;
    padding: 0 18px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }
  .share-button:disabled { opacity: 0.72; cursor: wait; }
  .share-status { margin: 0; color: var(--muted); font-size: 14px; }
  .share-status.is-error { color: var(--danger); }
  @media (max-width: 560px) {
    main { width: calc(100% - 24px); padding: 34px 0 64px; }
    header, .content, .share-card { border-radius: 8px; }
    h1 { font-size: 32px; }
    .share-row { grid-template-columns: 1fr; }
    .share-native-info { align-items: flex-start; flex-direction: column; }
    .share-native-info p { text-align: left; }
  }
`;
