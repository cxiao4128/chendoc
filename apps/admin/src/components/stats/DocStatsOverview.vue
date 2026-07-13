<script setup lang="ts">
import type { DeviceBreakdown, DailyView } from "@/services/api";

defineProps<{
  totalViews: number;
  uniqueVisitors: number;
  deviceBreakdown: DeviceBreakdown[];
  recentViews: DailyView[];
  maxDeviceCount: number;
  formatNumber: (value: number) => string;
  formatDevice: (device: string | undefined) => string;
  calculatePercent: (value: number, total: number) => number;
  getDeviceColor: (device: string) => string;
  getBarHeight: (count: number) => string;
}>();
</script>

<template>
  <div class="stats-panel__overview">
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

    <div class="stats-section">
      <h3>设备分布</h3>
      <div v-if="deviceBreakdown.length > 0" class="stats-devices">
        <div v-for="item in deviceBreakdown" :key="item.device" class="stats-device">
          <div class="stats-device__info">
            <span class="stats-device__dot" :style="{ backgroundColor: getDeviceColor(item.device) }"></span>
            <span class="stats-device__name">{{ formatDevice(item.device) }}</span>
            <span class="stats-device__count">{{ formatNumber(item.count) }}</span>
            <span class="stats-device__percent">{{ calculatePercent(item.count, totalViews) }}%</span>
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

    <div class="stats-section">
      <h3>访问趋势</h3>
      <div v-if="recentViews.length > 0" class="stats-chart">
        <div class="stats-chart__bars">
          <div v-for="item in recentViews" :key="item.date" class="stats-chart__bar" :title="`${item.date}: ${item.count}次`">
            <div class="stats-chart__fill" :style="{ height: getBarHeight(item.count) }"></div>
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
</template>
