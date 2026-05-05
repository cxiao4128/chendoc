import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/login" },
    { path: "/login", component: () => import("../pages/login/LoginPage.vue"), meta: { public: true } },
    { path: "/register", component: () => import("../pages/register/RegisterPage.vue"), meta: { public: true } },
    {
      path: "/admin",
      component: () => import("../pages/admin/AdminLayout.vue"),
      meta: { auth: true },
      children: [
        { path: "", redirect: "/admin/docs" },
        { path: "docs", component: () => import("../pages/docs/DocListPage.vue") },
        { path: "docs/:id", component: () => import("../pages/docs/DocEditorPage.vue") },
        { path: "trash", component: () => import("../pages/docs/TrashPage.vue"), meta: { admin: true } },
        { path: "invites", component: () => import("../pages/invites/InvitePage.vue"), meta: { admin: true } },
        { path: "share-reviews", component: () => import("../pages/reviews/ShareReviewPage.vue"), meta: { admin: true } },
        { path: "settings", component: () => import("../pages/settings/SettingsPage.vue"), meta: { admin: true } },
        { path: "settings/storage", component: () => import("../pages/settings/SettingsStoragePage.vue"), meta: { admin: true } },
        { path: "article-delete", component: () => import("../pages/danger/DangerPage.vue"), meta: { admin: true } },
        { path: "danger", component: () => import("../pages/danger/DangerPage.vue"), meta: { admin: true } }
      ]
    }
  ]
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready && auth.token) await auth.fetchMe();

  if (to.meta.public && auth.isLoggedIn) {
    return "/admin/docs";
  }

  if (!to.meta.public && !auth.user) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  if (to.meta.admin && !auth.canAccessAdmin) {
    return { path: "/admin/docs", query: { reason: "admin-required" } };
  }
});

export default router;
