import { createRouter, createWebHistory } from "vue-router";
import { homeForUser, isAdminPath, isUsersPath } from "./access";

const LOGIN_REDIRECT_KEY = "chendoc_login_redirect";

function rememberLoginRedirect(path: string) {
  if (!path || path === "/" || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(LOGIN_REDIRECT_KEY, path);
  } catch {
    // Session storage is optional; keep /login clean either way.
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: () => import("../pages/login/LoginPage.vue") },
    { path: "/login", component: () => import("../pages/login/LoginPage.vue"), meta: { public: true } },
    { path: "/forgot-password", component: () => import("../pages/login/ForgotPasswordPage.vue"), meta: { public: true } },
    { path: "/register", component: () => import("../pages/register/RegisterPage.vue"), meta: { public: true } },
    {
      path: "/admin",
      component: () => import("../pages/admin/AdminLayout.vue"),
      meta: { auth: true, admin: true },
      children: [
        { path: "", redirect: "/admin/docs" },
        { path: "docs", component: () => import("../pages/docs/DocListPage.vue") },
        { path: "docs/:docUid", component: () => import("../pages/docs/DocEditorPage.vue") },
        { path: "trash", component: () => import("../pages/docs/TrashPage.vue"), meta: { admin: true } },
        { path: "templates", component: () => import("../pages/docs/TemplateCenterPage.vue") },
        { path: "knowledge", component: () => import("../pages/docs/KnowledgeBasePage.vue") },
        { path: "invites", component: () => import("../pages/invites/InvitePage.vue"), meta: { admin: true } },
        { path: "forms", component: () => import("../pages/forms/FormListPage.vue"), meta: { admin: true } },
        { path: "forms/new", component: () => import("../pages/forms/FormEditorPage.vue"), meta: { admin: true } },
        { path: "forms/:id", component: () => import("../pages/forms/FormEditorPage.vue"), meta: { admin: true } },
        { path: "forms/:id/submissions", component: () => import("../pages/forms/FormSubmissionsPage.vue"), meta: { admin: true } },
        { path: "share-reviews", component: () => import("../pages/reviews/ShareReviewPage.vue"), meta: { admin: true } },
        { path: "comments", component: () => import("../pages/comments/CommentManagePage.vue"), meta: { admin: true } },
        { path: "security", component: () => import("../pages/settings/SecurityCenterPage.vue"), meta: { admin: true } },
        { path: "settings", component: () => import("../pages/settings/SettingsPage.vue"), meta: { admin: true } },
        { path: "settings/storage", component: () => import("../pages/settings/SettingsStoragePage.vue"), meta: { admin: true } },
        { path: "article-delete", component: () => import("../pages/danger/DangerPage.vue"), meta: { admin: true } },
        { path: "danger", component: () => import("../pages/danger/DangerPage.vue"), meta: { admin: true } }
      ]
    },
    {
      path: "/users",
      component: () => import("../pages/admin/AdminLayout.vue"),
      meta: { auth: true, userWorkspace: true },
      children: [
        { path: "", redirect: "/users/docs" },
        { path: "docs", component: () => import("../pages/docs/DocListPage.vue") },
        { path: "docs/:docUid", component: () => import("../pages/docs/DocEditorPage.vue") },
        { path: "trash", component: () => import("../pages/docs/TrashPage.vue") },
        { path: "templates", component: () => import("../pages/docs/TemplateCenterPage.vue") },
        { path: "knowledge", component: () => import("../pages/docs/KnowledgeBasePage.vue") }
      ]
    }
  ]
});

router.beforeEach(async (to) => {
  if (to.path === "/login" && (Object.keys(to.query).length > 0 || to.hash)) {
    return { path: "/login", replace: true };
  }

  const { useAuthStore } = await import("../stores/auth");
  const auth = useAuthStore();

  if (to.path === "/") {
    return auth.user ? homeForUser(auth.user) : "/login";
  }

  if (to.meta.public && auth.isLoggedIn) {
    return homeForUser(auth.user);
  }

  const needsAuth = to.meta.auth || isAdminPath(to.path) || isUsersPath(to.path);
  if (needsAuth && !auth.ready) await auth.fetchMe();

  if (needsAuth && !auth.user) {
    rememberLoginRedirect(to.fullPath);
    return "/login";
  }

  if (auth.user && isAdminPath(to.path) && !auth.canAccessAdmin) {
    return "/users/docs";
  }

  if (auth.user && isUsersPath(to.path) && auth.canAccessAdmin) {
    return "/admin/docs";
  }
});

export default router;
