import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

export function useAuth() {
  const router = useRouter();
  const auth = useAuthStore();

  function logout() {
    auth.logout();
    router.push("/login");
  }

  return { auth, logout };
}
