<script setup lang="ts">
// ChenDoc v2.10.0 - 文档统计面板组件
import { ref, computed, onMounted, watch } from "vue";
import {
  getAccessStats,
  getRecentAccess,
  formatNumber,
  formatDevice,
  calculatePercent,
  type AccessStats,
  type AccessLog,
} from "../../api/stats.js";

const props = defineProps<{
  type: "doc" | "form";
  id: number;
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// 状态
const stats = ref<AccessStats | null>(null);
const recentLogs = ref<AccessLog[]>([]);
const loading = ref(false);
const error = ref("");
const activeTab = ref<"overview" | "recent">("overview");
const days = ref(30);

// 计算属性
const totalViews = computed(() => stats.value?.totalViews ?? 0);
const uniqueVisitors = computed(() => stats.value?.uniqueVisitors ?? 0);
const deviceBreakdown = computed(() => stats.value?.deviceBreakdown ?? []);
const recentViews = computed(() => stats.value?.recentViews ?? []);

const maxDeviceCount = computed(() => {
  if (deviceBreakdown.value.length === 0) return 0;
  return Math.max(...deviceBreakdown.value.map(d => d.count));
});

const chartMaxValue = computed(() => {
  if (recentViews.value.length === 0) return 0;
  return Math.max(...recentViews.value.map(d => d.count));
});

// 加载统计数据
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

// 格式化日期
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

// 设备颜色
const deviceColors: Record<string, string> = {
  desktop: "#3b82f6",
  mobile: "#10b981",
  tablet: "#f59e0b",
  unknown: "#6b7280",
};

// 获取设备颜色
function getDeviceColor(device: string): string {
  return deviceColors[device] || deviceColors.unknown;
}

// 获取柱状图高度百分比
function getBarHeight(count: number): string {
  if (chartMaxValue.value === 0) return "0%";
  return `${(count / chartMaxValue.value) * 100}%`;
}

// 初始化和监听
onMounted(() => {
  if (props.visible) {
    void loadStats();
  }
});

watch(() => props.visible, (newVal) => {
  if (newVal) {
    void loadStats();
  }
});

// 切换天数
function setDays(newDays: number) {
  days.value = newDays;
  void loadStats();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="stats-overlay" @click.self="emit('close')">
      <div class="stats-panel">
        <div class="stats-panel__header">
          <h2>访问统计</h2>
          <button class="stats-panel__close" @click="emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="stats-panel__loading">
          <div class="stats-skeleton"></div>
          <div class="stats-skeleton"></div>
          <div class="stats-skeleton"></div>
        </div>

        <!-- 错误提示 -->
        <div v-else-if="error" class="stats-panel__error">
          {{ error }}
        </div>

        <!-- 统计数据 -->
        <div v-else class="stats-panel__content">
          <!-- 时间范围选择 -->
          <div class="stats-panel__range">
            <button
              :class="{ active: days === 7 }"
              @click="setDays(7)"
            >7天</button>
            <button
              :class="{ active: days === 30 }"
              @click="setDays(30)"
            >30天</button>
            <button
              :class="{ active: days === 90 }"
              @click="setDays(90)"
            >90天</button>
          </div>

          <!-- 概览标签 -->
          <div class="stats-panel__tabs">
            <button
              :class="{ active: activeTab === 'overview' }"
              @click="activeTab = 'overview'"
            >概览</button>
            <button
              :class="{ active: activeTab === 'recent' }"
              @click="activeTab = 'recent'"
            >最近访问</button>
          </div>

          <!-- 概览内容 -->
          <div v-if="activeTab === 'overview'" class="stats-panel__overview">
            <!-- 核心指标 -->
            <div class="stats-metrics">
              <div class="stats-metric">
                <span class="stats-metric__value">{{ formatNumber(totalViews) }}</span>
                <span class="stats-metric__label">总访问量</span>
              </div>
              <div class="stats-metric">
                <span class="stats-metric__value">{{ formatNumber(uniqueVisitors) }}</span>
                <span class="stats-metric__label">独立访客</span>
              </div>
            </div>

            <!-- 设备分布 -->
            <div class="stats-section">
              <h3>设备分布</h3>
              <div v-if="deviceBreakdown.length > 0" class="stats-devices">
                <div
                  v-for="item in deviceBreakdown"
                  :key="item.device"
                  class="stats-device"
                >
                  <div class="stats-device__info">
                    <span
                      class="stats-device__dot"
                      :style="{ backgroundColor: getDeviceColor(item.device) }"
                    ></span>
                    <span class="stats-device__name">{{ formatDevice(item.device) }}</span>
                    <span class="stats-device__count">{{ formatNumber(item.count) }}</span>
                    <span class="stats-device__percent">
                      {{ calculatePercent(item.count, totalViews) }}%
                    </span>
                  </div>
                  <div class="stats-device__bar">
                    <div
                      class="stats-device__fill"
                      :style="{
                        width: `${(item.count / maxDeviceCount) * 100}%`,
                        backgroundColor: getDeviceColor(item.device)
                      }"
                    ></div>
                  </div>
                </div>
              </div>
              <div v-else class="stats-empty">暂无数据</div>
            </div>

            <!-- 访问趋势 -->
            <div class="stats-section">
              <h3>访问趋势</h3>
              <div v-if="recentViews.length > 0" class="stats-chart">
                <div class="stats-chart__bars">
                  <div
                    v-for="item in recentViews"
                    :key="item.date"
                    class="stats-chart__bar"
                    :title="`${item.date}: ${item.count}次`"
                  >
                    <div
                      class="stats-chart__fill"
                      :style="{ height: getBarHeight(item.count) }"
                    ></div>
                  </div>
                </div>
                <div class="stats-chart__labels">
                  <span v-if="recentViews.length > 0">{{ recentViews[0]?.date }}</span>
                  <span v-if="recentViews.length > 1">{{ recentViews[recentViews.length - 1]?.date }}</span>
                </div>
              </div>
              <div v-else class="stats-empty">暂无数据</div>
            </div>
          </div>

          <!-- 最近访问 -->
          <div v-if="activeTab === 'recent'" class="stats-panel__recent">
            <div v-if="recentLogs.length > 0" class="stats-logs">
              <div
                v-for="log in recentLogs"
                :key="log.id"
                class="stats-log"
              >
                <div class="stats-log__info">
                  <span
                    class="stats-log__device"
                    :style="{ backgroundColor: getDeviceColor(log.device || 'unknown') }"
                  >{{ formatDevice(log.device) }}</span>
                  <span class="stats-log__time">{{ formatDate(log.viewedAt) }}</span>
                </div>
                <span class="stats-log__ua">{{ log.userAgent || "未知浏览器" }}</span>
              </div>
            </div>
            <div v-else class="stats-empty">暂无访问记录</div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.stats-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.stats-panel {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--cd-bg);
  border-radius: var(--cd-radius-lg);
  box-shadow: var(--cd-shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.stats-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cd-border);
}

.stats-panel__header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--cd-ink);
}

.stats-panel__close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--cd-radius);
  background: transparent;
  color: var(--cd-muted);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.stats-panel__close:hover {
  background: var(--cd-panel);
  color: var(--cd-text);
}

.stats-panel__loading {
  padding: 20px;
  display: grid;
  gap: 12px;
}

.stats-skeleton {
  height: 80px;
  background: var(--cd-panel);
  border-radius: var(--cd-radius);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.stats-panel__error {
  padding: 20px;
  text-align: center;
  color: var(--cd-danger);
}

.stats-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.stats-panel__range {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.stats-panel__range button {
  padding: 6px 12px;
  border: 1px solid var(--cd-border);
  border-radius: var(--cd-radius);
  background: transparent;
  color: var(--cd-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.stats-panel__range button:hover {
  border-color: var(--cd-accent);
  color: var(--cd-accent);
}

.stats-panel__range button.active {
  background: var(--cd-accent-soft);
  border-color: var(--cd-accent);
  color: var(--cd-accent);
}

.stats-panel__tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--cd-border);
}

.stats-panel__tabs button {
  padding: 8px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--cd-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.stats-panel__tabs button:hover {
  color: var(--cd-text);
}

.stats-panel__tabs button.active {
  color: var(--cd-accent);
  border-bottom-color: var(--cd-accent);
}

.stats-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.stats-metric {
  padding: 16px;
  background: var(--cd-paper-soft);
  border-radius: var(--cd-radius);
  text-align: center;
}

.stats-metric__value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: var(--cd-accent);
  margin-bottom: 4px;
}

.stats-metric__label {
  font-size: 12px;
  color: var(--cd-text-secondary);
}

.stats-section {
  margin-bottom: 20px;
}

.stats-section h3 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stats-devices {
  display: grid;
  gap: 12px;
}

.stats-device__info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.stats-device__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stats-device__name {
  font-size: 13px;
  color: var(--cd-text);
}

.stats-device__count {
  font-size: 13px;
  font-weight: 600;
  color: var(--cd-ink);
  margin-left: auto;
}

.stats-device__percent {
  font-size: 12px;
  color: var(--cd-muted);
}

.stats-device__bar {
  height: 6px;
  background: var(--cd-panel);
  border-radius: 3px;
  overflow: hidden;
}

.stats-device__fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.stats-chart {
  padding: 12px 0;
}

.stats-chart__bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 60px;
}

.stats-chart__bar {
  flex: 1;
  min-width: 4px;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.stats-chart__fill {
  width: 100%;
  background: var(--cd-accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height 0.3s ease;
}

.stats-chart__labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: var(--cd-muted);
}

.stats-empty {
  padding: 24px;
  text-align: center;
  color: var(--cd-muted);
  font-size: 13px;
}

.stats-logs {
  display: grid;
  gap: 8px;
}

.stats-log {
  padding: 10px 12px;
  background: var(--cd-paper-soft);
  border-radius: var(--cd-radius);
}

.stats-log__info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.stats-log__device {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: white;
}

.stats-log__time {
  font-size: 12px;
  color: var(--cd-muted);
  margin-left: auto;
}

.stats-log__ua {
  font-size: 11px;
  color: var(--cd-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
