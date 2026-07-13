<script setup lang="ts">
import { formatFormDate, type IpStats } from "../../../features/forms";

defineProps<{
  ipStats: IpStats[];
}>();
</script>

<template>
  <div class="tab-content">
    <div v-if="ipStats.length === 0" class="empty-state">
      暂无来源统计数据
    </div>

    <div v-else class="ip-table">
      <table>
        <thead>
          <tr>
            <th>来源摘要</th>
            <th>提交次数</th>
            <th>首次提交</th>
            <th>最近提交</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stat in ipStats" :key="stat.ip">
            <td class="ip-cell">{{ stat.ip }}</td>
            <td>{{ stat.count }}</td>
            <td>{{ formatFormDate(stat.firstAt) }}</td>
            <td>{{ formatFormDate(stat.lastAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
