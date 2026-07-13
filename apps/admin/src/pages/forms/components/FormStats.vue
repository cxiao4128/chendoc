<script setup lang="ts">
import { computed } from "vue";
import { Copy } from "lucide-vue-next";
import type { FormField } from "../../../features/forms";

type FormStatus = "draft" | "published" | "closed";

const props = defineProps<{
  formStatus: FormStatus;
  formUrl: string;
  copied: boolean;
  statsData: {
    submissionCount: number;
    viewCount: number;
    ipCount: number;
    sampleCount: number;
    fieldStats: Array<{ fieldId: string; label: string; count: number; percentage: number }>;
  };
  config: {
    maxSubmissions: number | null;
    allowMultiple: boolean;
  };
  fields: FormField[];
}>();

defineEmits<{
  copyLink: [];
}>();

const visibleFields = computed(() => props.fields.filter((field) => field.type !== "section"));
</script>

<template>
  <section class="form-body">
    <main class="form-stats-content">
      <div class="form-stats-status">
        <span v-if="formStatus === 'published'" class="form-stats-status__badge published">收集中</span>
        <span v-else-if="formStatus === 'closed'" class="form-stats-status__badge closed">已暂停</span>
        <span v-else class="form-stats-status__badge">暂未发布</span>
        <button v-if="formUrl" class="form-stats-copy-btn" type="button" @click="$emit('copyLink')">
          <Copy :size="14" />
          {{ copied ? "已复制" : "复制链接" }}
        </button>
      </div>
      <div class="form-stats-cards">
        <div class="form-stats-card">
          <div class="form-stats-card__header">
            <h3>收集概况</h3>
          </div>
          <div class="form-stats-card__body">
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ statsData.submissionCount }}</span>
              <span class="form-stats-metric__label">提交数</span>
            </div>
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ statsData.viewCount }}</span>
              <span class="form-stats-metric__label">访问数</span>
            </div>
            <div class="form-stats-metric">
              <span class="form-stats-metric__value">{{ statsData.ipCount }}</span>
              <span class="form-stats-metric__label">来源数（最多 100）</span>
            </div>
          </div>
        </div>
        <div class="form-stats-card">
          <div class="form-stats-card__header">
            <h3>字段完成度{{ statsData.sampleCount ? `（最近 ${statsData.sampleCount} 份）` : "" }}</h3>
          </div>
          <div class="form-stats-card__body form-stats-chart">
            <div v-if="statsData.fieldStats.length === 0" class="form-stats-empty">暂无数据</div>
            <div v-else class="form-stats-field-list">
              <div v-for="stat in statsData.fieldStats" :key="stat.fieldId" class="form-stats-field-item">
                <span class="form-stats-field-label">{{ stat.label }}</span>
                <div class="form-stats-field-bar">
                  <div class="form-stats-field-fill" :style="{ width: stat.percentage + '%' }"></div>
                </div>
                <span class="form-stats-field-count">{{ stat.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="form-stats-card form-stats-card--full">
        <div class="form-stats-card__header">
          <h3>收集限制</h3>
        </div>
        <div class="form-stats-card__body form-stats-grid">
          <div class="form-stats-metric">
            <span class="form-stats-metric__value">{{ config.maxSubmissions || "∞" }}</span>
            <span class="form-stats-metric__label">份数限制</span>
          </div>
          <div class="form-stats-metric">
            <span class="form-stats-metric__value">{{ config.allowMultiple ? "是" : "否" }}</span>
            <span class="form-stats-metric__label">允许多份</span>
          </div>
          <div class="form-stats-metric">
            <span class="form-stats-metric__value">{{ fields.filter((field) => field.type !== "section").length }}</span>
            <span class="form-stats-metric__label">问题数量</span>
          </div>
          <div class="form-stats-metric">
            <span class="form-stats-metric__value">{{ visibleFields.filter((field) => field.required).length }}</span>
            <span class="form-stats-metric__label">必填问题</span>
          </div>
        </div>
      </div>
    </main>
  </section>
</template>
