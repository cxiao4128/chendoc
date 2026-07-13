import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchProfileApi, restoreSessionApi } from "../services/api/auth.api";
import type { UserProfile } from "../services/api/auth.api";
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

  async function fetchMe(force = false): Promise<UserProfile | null> {
    if (!force && ready.value && user.value && Date.now() - lastFetchedAt < ME_CACHE_TTL_MS) return user.value;
    if (inflightMe) return inflightMe;

    let resolveMe: (value: UserProfile | null) => void;
    let rejectMe: (error: unknown) => void;
    inflightMe = new Promise<UserProfile | null>((resolve, reject) => {
      resolveMe = resolve;
      rejectMe = reject;
    });

    const execute = async () => {
      try {
        if (!getAuthToken()) {
          const restored = await restoreSessionApi();
          setSession(restored.user, restored.token, restored.expiresAt);
          resolveMe!(restored.user);
          return;
        }
        const response = await fetchProfileApi();
        user.value = response.user;
        lastFetchedAt = Date.now();
        resolveMe!(response.user);
      } catch (err) {
        console.error("[auth] fetchMe failed:", err instanceof Error ? err.message : String(err));
        logout();
        resolveMe!(null);
      } finally {
        ready.value = true;
        inflightMe = null;
      }
    };

    execute().catch((err) => {
      rejectMe(err);
    });

    return inflightMe;
  }

  return { token, user, ready, isLoggedIn, isAdmin, isSuperAdmin, canAccessAdmin, setSession, logout, fetchMe };
});
