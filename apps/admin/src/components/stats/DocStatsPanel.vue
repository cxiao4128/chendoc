<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  calculatePercent,
  formatDevice,
  formatNumber,
  getAccessStats,
  getRecentAccess,
  type AccessLog,
  type AccessStats
} from "@/services/api";
import DocStatsControls from "./DocStatsControls.vue";
import DocStatsHeader from "./DocStatsHeader.vue";
import DocStatsOverview from "./DocStatsOverview.vue";
import DocStatsRecent from "./DocStatsRecent.vue";
import "./doc-stats-panel.css";

const props = defineProps<{
  type: "doc" | "form";
  id: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

type StatsTab = "overview" | "recent";

const stats = ref<AccessStats | null>(null);
const recentLogs = ref<AccessLog[]>([]);
const loading = ref(false);
const error = ref("");
const activeTab = ref<StatsTab>("overview");
const days = ref(30);

const totalViews = computed(() => stats.value?.totalViews ?? 0);
const uniqueVisitors = computed(() => stats.value?.uniqueVisitors ?? 0);
const deviceBreakdown = computed(() => stats.value?.deviceBreakdown ?? []);
const recentViews = computed(() => stats.value?.recentViews ?? []);

const maxDeviceCount = computed(() => {
  if (deviceBreakdown.value.length === 0) return 0;
  return Math.max(...deviceBreakdown.value.map((device) => device.count));
});

const chartMaxValue = computed(() => {
  if (recentViews.value.length === 0) return 0;
  return Math.max(...recentViews.value.map((item) => item.count));
});

const deviceColors: Record<string, string> = {
  desktop: "#3b82f6",
  mobile: "#10b981",
  tablet: "#f59e0b",
  unknown: "#6b7280"
};

async function loadStats() {
  loading.value = true;
  error.value = "";
  try {
    stats.value = await getAccessStats(props.type, props.id, { days: days.value });
    recentLogs.value = await getRecentAccess(props.type, props.id, { limit: 20 });
  } catch (e: any) {
    error.value = e.message || "加载统计数据失败";
  } finally {
    loading.value = false;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

function getDeviceColor(device: string): string {
  return deviceColors[device] || deviceColors.unknown;
}

function getBarHeight(count: number): string {
  if (chartMaxValue.value === 0) return "0%";
  return `${(count / chartMaxValue.value) * 100}%`;
}

function setDays(newDays: number) {
  days.value = newDays;
  void loadStats();
}

function setTab(nextTab: StatsTab) {
  activeTab.value = nextTab;
}

onMounted(() => {
  if (props.visible) void loadStats();
});

watch(() => props.visible, (newVal) => {
  if (newVal) void loadStats();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="stats-overlay" @click.self="emit('close')">
      <div class="stats-panel">
        <DocStatsHeader @close="emit('close')" />

        <div v-if="loading" class="stats-panel__loading">
          <div class="stats-skeleton"></div>
          <div class="stats-skeleton"></div>
          <div class="stats-skeleton"></div>
        </div>

        <div v-else-if="error" class="stats-panel__error">{{ error }}</div>

        <div v-else class="stats-panel__content">
          <DocStatsControls
            :days="days"
            :active-tab="activeTab"
            @set-days="setDays"
            @set-tab="setTab"
          />

          <DocStatsOverview
            v-if="activeTab === 'overview'"
            :total-views="totalViews"
            :unique-visitors="uniqueVisitors"
            :device-breakdown="deviceBreakdown"
            :recent-views="recentViews"
            :max-device-count="maxDeviceCount"
            :format-number="formatNumber"
            :format-device="formatDevice"
            :calculate-percent="calculatePercent"
            :get-device-color="getDeviceColor"
            :get-bar-height="getBarHeight"
          />
          <DocStatsRecent
            v-else
            :recent-logs="recentLogs"
            :format-date="formatDate"
            :format-device="formatDevice"
            :get-device-color="getDeviceColor"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>
