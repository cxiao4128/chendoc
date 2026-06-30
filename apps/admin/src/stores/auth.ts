import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { UserProfile } from "../api/auth";
import { clearAuthSession, getAuthToken, saveAuthSession } from "../security/sessionToken";

const ME_CACHE_TTL_MS = 30 * 1000;

export const useAuthStore = defineStore("auth", () => {
  const user = ref<UserProfile | null>(null);
  const token = computed(() => user.value ? getAuthToken() : "");
  const ready = ref(false);
  let lastFetchedAt = 0;
  let inflightMe: Promise<UserProfile | null> | null = null;

  const isLoggedIn = computed(() => !!user.value);
  const isSuperAdmin = computed(() => !!user.value?.isSuperAdmin);
  const isAdmin = computed(() => user.value?.role === "admin" || isSuperAdmin.value);
  const canAccessAdmin = computed(() => isSuperAdmin.value);

  function setSession(nextUser: UserProfile, tokenValue: string, expiresAt?: string | number | Date) {
    user.value = nextUser;
    ready.value = true;
    lastFetchedAt = Date.now();
    saveAuthSession(tokenValue, expiresAt);
  }

  function logout() {
    user.value = null;
    lastFetchedAt = 0;
    clearAuthSession();
    void import("../services/localDraft").then(({ clearLocalDrafts }) => clearLocalDrafts()).catch(() => undefined);
  }

  async function fetchMe(force = false) {
    if (!force && ready.value && user.value && Date.now() - lastFetchedAt < ME_CACHE_TTL_MS) return user.value;
    if (inflightMe) return inflightMe;

    let resolveMe: (value: UserProfile | null) => void;
    let rejectMe: (error: unknown) => void;
    inflightMe = new Promise<UserProfile | null>((resolve, reject) => {
      resolveMe = resolve;
      rejectMe = reject;
    });

    (async () => {
      try {
        const { a2: fetchProfile, a4: restoreSession } = await import("../api/auth");
        if (!getAuthToken()) {
          const restored = await restoreSession();
          setSession(restored.user, restored.token, restored.expiresAt);
          resolveMe(restored.user);
          return;
        }
        const response = await fetchProfile();
        user.value = response.user;
        lastFetchedAt = Date.now();
        resolveMe(response.user);
      } catch {
        logout();
        resolveMe(null);
      } finally {
        ready.value = true;
        inflightMe = null;
      }
    })();

    return inflightMe;
  }

  return { token, user, ready, isLoggedIn, isAdmin, isSuperAdmin, canAccessAdmin, setSession, logout, fetchMe };
});
