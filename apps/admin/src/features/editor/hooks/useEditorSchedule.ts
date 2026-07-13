/**
 * features/editor/hooks/useEditorSchedule.ts - 编辑器定时发布 Hook
 *
 * 重构说明：
 * - 从 pages/docs/composables/useDocEditorSchedule.ts 迁移
 * - 封装定时发布和过期草稿的加载、保存、清除操作
 */
import { ref, type Ref } from "vue";
import {
  deleteDocScheduleApi,
  getDocScheduleApi,
  setDocScheduleApi,
  type DocDetail
} from "../../../api/docs";

export type ScheduleInput = {
  scheduledAt?: string | null;
  expiresAt?: string | null;
  autoArchive?: boolean;
};

// ============= 导出 Hook =============
export function useEditorSchedule(current: Ref<DocDetail | null>) {
  // ============= 状态 =============

  /** 定时面板是否打开 */
  const schedulePanelOpen = ref(false);

  /** 加载中 */
  const scheduleLoading = ref(false);

  /** 错误信息 */
  const scheduleError = ref("");

  /** 定时数据 */
  const scheduleData = ref<ScheduleInput | null>(null);
  let requestSequence = 0;

  function isCurrentRequest(targetDocUid: string, sequence: number) {
    return requestSequence === sequence && current.value?.docUid === targetDocUid;
  }

  function resetScheduleState() {
    requestSequence += 1;
    schedulePanelOpen.value = false;
    scheduleLoading.value = false;
    scheduleError.value = "";
    scheduleData.value = null;
  }

  // ============= 方法 =============

  /** 加载定时设置 */
  async function loadSchedule() {
    if (!current.value) return;
    const targetDocUid = current.value.docUid;
    const sequence = ++requestSequence;
    scheduleLoading.value = true;
    scheduleError.value = "";
    try {
      const res = await getDocScheduleApi(targetDocUid);
      if (!isCurrentRequest(targetDocUid, sequence)) return;
      scheduleData.value = res.schedule;
    } catch (e: unknown) {
      if (isCurrentRequest(targetDocUid, sequence)) {
        scheduleError.value = e instanceof Error ? e.message : "加载定时设置失败";
      }
    } finally {
      if (isCurrentRequest(targetDocUid, sequence)) scheduleLoading.value = false;
    }
  }

  /** 保存定时设置 */
  async function saveSchedule(input: ScheduleInput) {
    if (!current.value) return;
    const targetDocUid = current.value.docUid;
    const sequence = ++requestSequence;
    scheduleLoading.value = true;
    scheduleError.value = "";
    try {
      const res = await setDocScheduleApi(targetDocUid, input);
      if (!isCurrentRequest(targetDocUid, sequence)) return;
      scheduleData.value = res.schedule;
      schedulePanelOpen.value = false;
    } catch (e: unknown) {
      if (isCurrentRequest(targetDocUid, sequence)) {
        scheduleError.value = e instanceof Error ? e.message : "保存定时设置失败";
      }
    } finally {
      if (isCurrentRequest(targetDocUid, sequence)) scheduleLoading.value = false;
    }
  }

  /** 清除定时设置 */
  async function clearSchedule() {
    if (!current.value) return;
    const targetDocUid = current.value.docUid;
    const sequence = ++requestSequence;
    scheduleLoading.value = true;
    scheduleError.value = "";
    try {
      await deleteDocScheduleApi(targetDocUid);
      if (!isCurrentRequest(targetDocUid, sequence)) return;
      scheduleData.value = null;
      schedulePanelOpen.value = false;
    } catch (e: unknown) {
      if (isCurrentRequest(targetDocUid, sequence)) {
        scheduleError.value = e instanceof Error ? e.message : "清除定时设置失败";
      }
    } finally {
      if (isCurrentRequest(targetDocUid, sequence)) scheduleLoading.value = false;
    }
  }

  /** 打开定时面板 */
  function openSchedulePanel() {
    if (!current.value) return;
    void loadSchedule();
    schedulePanelOpen.value = true;
  }

  return {
    // 状态
    schedulePanelOpen,
    scheduleLoading,
    scheduleError,
    scheduleData,

    // 方法
    loadSchedule,
    saveSchedule,
    clearSchedule,
    openSchedulePanel,
    resetScheduleState,
  };
}
