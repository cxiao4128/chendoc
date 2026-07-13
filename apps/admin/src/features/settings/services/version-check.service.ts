const GITHUB_API_BASE = "https://api.github.com/repos/cxiao4128/chendoc";
const GITHUB_RAW_PACKAGE_URL = "https://raw.githubusercontent.com/cxiao4128/chendoc/main/package.json";

export async function fetchLatestGitHubVersion() {
  const packageResponse = await fetch(`${GITHUB_RAW_PACKAGE_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (packageResponse.ok) {
    const packageJson = await packageResponse.json() as { version?: string };
    if (packageJson.version) return packageJson.version;
  }

  const releaseResponse = await fetch(`${GITHUB_API_BASE}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (releaseResponse.ok) {
    const release = await releaseResponse.json() as { tag_name?: string; name?: string };
    if (release.tag_name || release.name) return String(release.tag_name || release.name);
  }

  const tagResponse = await fetch(`${GITHUB_API_BASE}/tags?per_page=1`, {
    headers: { Accept: "application/vnd.github+json" }
  });
  if (tagResponse.ok) {
    const tags = await tagResponse.json() as Array<{ name?: string }>;
    if (tags[0]?.name) return tags[0].name;
  }

  throw new Error("GitHub 暂无可比对版本");
}
