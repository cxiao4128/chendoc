import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { clearToken, getToken, setToken } from "../api/request";
import type { UserProfile } from "../api/auth";
import { meApi } from "../api/auth";

export const useAuthStore = defineStore("auth", () => {
  const token = ref(getToken());
  const user = ref<UserProfile | null>(null);
  const ready = ref(false);

  const isLoggedIn = computed(() => !!token.value && !!user.value);
  const isAdmin = computed(() => user.value?.role === "admin");
  const isSuperAdmin = computed(() => !!user.value?.isSuperAdmin);
  const canAccessAdmin = computed(() => isAdmin.value);

  function setSession(sessionId: string, sessionKey: string, nextUser: UserProfile) {
    token.value = sessionId;
    user.value = nextUser;
    setToken(sessionId, sessionKey);
  }

  function logout() {
    token.value = "";
    user.value = null;
    clearToken();
  }

  async function fetchMe() {
    if (!token.value) {
      ready.value = true;
      return null;
    }
    try {
      const response = await meApi();
      user.value = response.user;
      return response.user;
    } catch {
      logout();
      return null;
    } finally {
      ready.value = true;
    }
  }

  return { token, user, ready, isLoggedIn, isAdmin, isSuperAdmin, canAccessAdmin, setSession, logout, fetchMe };
});
