import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { UserProfile } from "../api/auth";
import { clearAuthSession, getSessionId, saveAuthSession } from "../security/sessionToken";

function getToken() {
  localStorage.removeItem("chendoc_token");
  return getSessionId();
}

function setToken(sessionId: string, sessionKey: string) {
  saveAuthSession(sessionId, sessionKey);
}

function clearToken() {
  localStorage.removeItem("chendoc_token");
  clearAuthSession();
}

const ME_CACHE_TTL_MS = 30 * 1000;

export const useAuthStore = defineStore("auth", () => {
  const token = ref(getToken());
  const user = ref<UserProfile | null>(null);
  const ready = ref(false);
  let lastFetchedAt = 0;
  let inflightMe: Promise<UserProfile | null> | null = null;

  const isLoggedIn = computed(() => !!token.value && !!user.value);
  const isSuperAdmin = computed(() => !!user.value?.isSuperAdmin);
  const isAdmin = computed(() => user.value?.role === "admin" || isSuperAdmin.value);
  const canAccessAdmin = computed(() => isAdmin.value);

  function setSession(sessionId: string, sessionKey: string, nextUser: UserProfile) {
    token.value = sessionId;
    user.value = nextUser;
    ready.value = true;
    lastFetchedAt = Date.now();
    setToken(sessionId, sessionKey);
  }

  function logout() {
    token.value = "";
    user.value = null;
    lastFetchedAt = 0;
    clearToken();
  }

  async function fetchMe(force = false) {
    if (!token.value) {
      ready.value = true;
      return null;
    }
    if (!force && ready.value && user.value && Date.now() - lastFetchedAt < ME_CACHE_TTL_MS) return user.value;
    if (inflightMe) return inflightMe;

    inflightMe = (async () => {
      try {
        const { a2: fetchProfile } = await import("../api/auth");
        const response = await fetchProfile();
        user.value = response.user;
        lastFetchedAt = Date.now();
        return response.user;
      } catch {
        logout();
        return null;
      } finally {
        ready.value = true;
        inflightMe = null;
      }
    })();

    return inflightMe;
  }

  return { token, user, ready, isLoggedIn, isAdmin, isSuperAdmin, canAccessAdmin, setSession, logout, fetchMe };
});
