import { BookOpen, ClipboardCheck, Settings, Ticket, Trash2 } from "lucide-vue-next";

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
  { to: "/admin/share-reviews", label: "审核", icon: ClipboardCheck, adminOnly: true },
  { to: "/admin/invites", label: "邀请码", icon: Ticket, adminOnly: true },
  { to: "/admin/settings", label: "系统设置", icon: Settings, adminOnly: true }
];

export function isAdminNavActive(currentPath: string, targetPath: string) {
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function getAdminRouteMeta(path: string): AdminRouteMeta {
  if (/^\/admin\/docs\/\d+/.test(path)) {
    return {
      eyebrow: "专注编辑",
      title: "文档工作台",
      description: "把文档切换、目录、历史和分享收进侧边面板，手机上也能像原生编辑器一样顺手。"
    };
  }

  if (path.startsWith("/admin/docs")) {
    return {
      eyebrow: "内容中心",
      title: "文档空间",
      description: "快速搜索、切换和接力编辑最近文档，手机端继续保持轻量、原生的浏览手感。"
    };
  }

  if (path.startsWith("/admin/invites")) {
    return {
      eyebrow: "账户入口",
      title: "邀请码",
      description: "批量生成、复制和管理邀请码，手机上也能直接处理分享与发放。"
    };
  }

  if (path.startsWith("/admin/share-reviews")) {
    return {
      eyebrow: "用户发布",
      title: "分享审核",
      description: "审核普通用户提交的公开分享，确认后再对外发布。"
    };
  }

  if (path.startsWith("/admin/settings/storage")) {
    return {
      eyebrow: "存储配置",
      title: "R2 对象存储",
      description: "账号、端点和连通性测试都整理成单页流程，手机上不用来回跳配置页。"
    };
  }

  if (path.startsWith("/admin/settings")) {
    return {
      eyebrow: "后台管理",
      title: "系统设置",
      description: "站点外观、登录资源和后台配置都拆成更适合手机操作的分层结构。"
    };
  }

  if (path.startsWith("/admin/trash")) {
    return {
      eyebrow: "回收站",
      title: "恢复中心",
      description: "删除后的内容集中保留，恢复和彻底删除都更清晰，避免手机端误触。"
    };
  }

  if (path.startsWith("/admin/article-delete") || path.startsWith("/admin/danger")) {
    return {
      eyebrow: "高风险操作",
      title: "文章删除",
      description: "保留明确的确认链路，让关键删除操作在手机端也不会显得仓促。"
    };
  }

  return {
    eyebrow: "内容中心",
    title: "文档空间",
    description: "快速搜索、切换和接力编辑最近文档，手机端继续保持轻量、原生的浏览手感。"
  };
}
