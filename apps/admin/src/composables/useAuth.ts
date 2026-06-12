import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

export function useAuth() {
  const router = useRouter();
  const auth = useAuthStore();

  async function logout() {
    try {
      const { a3: logoutApi } = await import("../api/auth");
      await logoutApi();
    } catch {
      // Local logout must still complete if the server session is already gone.
    }
    auth.logout();
    router.push("/login");
  }

  return { auth, logout };
}
