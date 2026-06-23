interface AuthJwtSession {
  token: string;
  expireAt: number;
}

const REFRESH_SKEW_MS = 10 * 60 * 1000;

function parseExpireAt(expireAt?: string | number | Date) {
  if (expireAt instanceof Date) return expireAt.getTime();
  if (typeof expireAt === "number") return expireAt;
  if (typeof expireAt === "string") {
    const parsed = Date.parse(expireAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// 业务 Token 只保存在当前页面内存。刷新后由服务端 HttpOnly 恢复凭据换回，
// 不写入 JavaScript 可读的 localStorage/sessionStorage。
let session: AuthJwtSession | null = null;

export function saveAuthSession(token: string, expireAt?: string | number | Date) {
  const value = parseExpireAt(expireAt);
  session = { token, expireAt: value || Date.now() + 2 * 60 * 60 * 1000 };
}

export function clearAuthSession() {
  session = null;
}

export function getAuthToken() {
  return session?.token || "";
}

export function getSessionId() {
  return "";
}

export function shouldRefreshAuthSession() {
  if (!session) return false;
  // 距离过期还有 10 分钟时触发刷新
  return session.expireAt - Date.now() <= REFRESH_SKEW_MS;
}

export async function buildAuthorization() {
  return session?.token ? `Bearer ${session.token}` : "";
}
