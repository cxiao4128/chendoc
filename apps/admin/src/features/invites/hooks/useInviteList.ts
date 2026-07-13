/**
 * features/invites/hooks/useInviteList.ts
 * 邀请码 hooks
 */
import { onMounted, ref } from "vue";
import type { InviteItem } from "@/api/invites";
import { createInviteApi, createInviteBatchApi, deleteInviteApi, disableInviteApi, listInvitesApi } from "@/api/invites";

export type { InviteItem };

export function useInviteList() {
  const invites = ref<InviteItem[]>([]);
  const loading = ref(false);
  const error = ref("");
  const copied = ref("");
  const batchCount = ref(5);
  const expireAt = ref("");
  const deleteTarget = ref<InviteItem | null>(null);
  const deleteOpen = ref(false);

  const statusLabel: Record<string, string> = {
    unused: "未使用",
    used: "已使用",
    disabled: "已禁用",
    expired: "已过期"
  };

  function formatDate(value?: string | null) {
    return value ? new Date(value).toLocaleString() : "-";
  }

  async function load() {
    loading.value = true;
    try {
      invites.value = (await listInvitesApi()).invites;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function createOne() {
    await createInviteApi(expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
    await load();
  }

  async function createBatch() {
    await createInviteBatchApi(batchCount.value, expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
    await load();
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    copied.value = code;
    setTimeout(() => {
      if (copied.value === code) copied.value = "";
    }, 2000);
  }

  function confirmDelete(item: InviteItem) {
    deleteTarget.value = item;
    deleteOpen.value = true;
  }

  async function doDelete() {
    if (!deleteTarget.value) return;
    try {
      await deleteInviteApi(deleteTarget.value.id);
      invites.value = invites.value.filter((item: InviteItem) => item.id !== deleteTarget.value?.id);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "删除失败";
    } finally {
      deleteOpen.value = false;
      deleteTarget.value = null;
    }
  }

  async function doDisable(item: InviteItem) {
    try {
      await disableInviteApi(item.id);
      await load();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "禁用失败";
    }
  }

  onMounted(load);

  return {
    invites,
    loading,
    error,
    copied,
    batchCount,
    expireAt,
    deleteTarget,
    deleteOpen,
    statusLabel,
    formatDate,
    load,
    createOne,
    createBatch,
    copy,
    confirmDelete,
    doDelete,
    doDisable
  };
}

export function useInviteGenerate() {
  const batchCount = ref(5);
  const expireAt = ref("");
  const creating = ref(false);
  const error = ref("");

  async function createOne() {
    creating.value = true;
    error.value = "";
    try {
      await createInviteApi(expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "创建失败";
    } finally {
      creating.value = false;
    }
  }

  async function createBatch() {
    creating.value = true;
    error.value = "";
    try {
      await createInviteBatchApi(batchCount.value, expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "批量创建失败";
    } finally {
      creating.value = false;
    }
  }

  return { batchCount, expireAt, creating, error, createOne, createBatch };
}
