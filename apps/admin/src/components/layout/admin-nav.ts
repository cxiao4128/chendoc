import { BookOpen, ClipboardCheck, FileSpreadsheet, Settings, ShieldCheck, Trash2 } from "lucide-vue-next";
import type { WorkspaceBase } from "../../router/access";

export interface AdminNavItem {
  to: string;
  label: string;
  icon: typeof BookOpen;
  adminOnly?: boolean;
}

export interface AdminRouteMeta {
  eyebrow: string;
  title: string;
  description: string;
}

export const adminNavItems: AdminNavItem[] = [
  { to: "/admin/docs", label: "文档", icon: BookOpen },
  { to: "/admin/trash", label: "回收站", icon: Trash2, adminOnly: true },
  { to: "/admin/invites", label: "邀请码", icon: BookOpen, adminOnly: true },
  { to: "/admin/forms", label: "收集表", icon: FileSpreadsheet, adminOnly: true },
  { to: "/admin/share-reviews", label: "审核", icon: ClipboardCheck, adminOnly: true },
  { to: "/admin/security", label: "安全中心", icon: ShieldCheck, adminOnly: true },
  { to: "/admin/templates", label: "模板中心", icon: BookOpen },
  { to: "/admin/knowledge", label: "知识库", icon: BookOpen },
  { to: "/admin/settings", label: "系统管理", icon: Settings, adminOnly: true }
];

export const userNavItems: AdminNavItem[] = [
  { to: "/users/docs", label: "文档", icon: BookOpen },
  { to: "/users/trash", label: "回收站", icon: Trash2 },
  { to: "/users/templates", label: "模板中心", icon: BookOpen },
  { to: "/users/knowledge", label: "知识库", icon: BookOpen }
];

export function getWorkspaceNavItems(base: WorkspaceBase, canAccessAdmin: boolean) {
  if (base === "/users") return userNavItems;
  return adminNavItems.filter((item) => !item.adminOnly || canAccessAdmin);
}

export function isAdminNavActive(currentPath: string, targetPath: string) {
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function getAdminRouteMeta(path: string): AdminRouteMeta {
  const normalizedPath = path.replace(/^\/users(?=\/|$)/, "/admin");

  if (/^\/admin\/docs\/\d+/.test(normalizedPath)) {
    return {
      eyebrow: "编辑",
      title: "编辑器",
      description: "编辑、目录、版本、分享。"
    };
  }

  if (normalizedPath.startsWith("/admin/docs")) {
    return {
      eyebrow: "ChenDoc",
      title: "文档",
      description: "文档、状态、分享。"
    };
  }

  if (normalizedPath.startsWith("/admin/forms")) {
    return {
      eyebrow: "数据收集",
      title: "收集表",
      description: "问卷调查、活动报名、反馈收集。"
    };
  }

  if (normalizedPath.startsWith("/admin/invites")) {
    return {
      eyebrow: "账号准入",
      title: "邀请码",
      description: "注册卡密。"
    };
  }

  if (normalizedPath.startsWith("/admin/share-reviews")) {
    return {
      eyebrow: "内容发布",
      title: "发布审核",
      description: "公开分享审核。"
    };
  }

  if (normalizedPath.startsWith("/admin/security")) {
    return {
      eyebrow: "账户安全",
      title: "安全中心",
      description: "双因素认证、恢复码、危险操作验证。"
    };
  }

  if (normalizedPath.startsWith("/admin/templates")) {
    return {
      eyebrow: "模板",
      title: "模板中心",
      description: "模板创建真实文档。"
    };
  }

  if (normalizedPath.startsWith("/admin/knowledge")) {
    return {
      eyebrow: "知识",
      title: "知识库",
      description: "已发布和已分享文档。"
    };
  }

  if (normalizedPath.startsWith("/admin/settings/storage")) {
    return {
      eyebrow: "存储配置",
      title: "R2 对象存储",
      description: "对象存储。"
    };
  }

  if (normalizedPath.startsWith("/admin/settings")) {
    return {
      eyebrow: "产品控制",
      title: "控制中心",
      description: "品牌、账号、存储、日志、版本。"
    };
  }

  if (normalizedPath.startsWith("/admin/trash")) {
    return {
      eyebrow: "回收站",
      title: "恢复中心",
      description: "恢复、删除。"
    };
  }

  if (normalizedPath.startsWith("/admin/article-delete") || normalizedPath.startsWith("/admin/danger")) {
    return {
      eyebrow: "高风险操作",
      title: "文档删除",
      description: "受控删除。"
    };
  }

  return {
    eyebrow: "ChenDoc",
    title: "文档",
    description: "文档。"
  };
}