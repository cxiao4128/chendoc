import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { logoutApi } from "../services/api";

export function useAuth() {
  const router = useRouter();
  const auth = useAuthStore();

  async function logout() {
    try {
      await logoutApi();
    } catch {
      // Local logout must still complete if the server session is already gone.
    }
    auth.logout();
    router.push("/login");
  }

  return { auth, logout };
}
