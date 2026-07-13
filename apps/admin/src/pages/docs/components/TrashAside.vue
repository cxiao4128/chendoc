<script setup lang="ts">
import type { DocSummary } from "@/services/api";

defineProps<{
  docs: DocSummary[];
  storagePercent: number;
  usedStorageText: string;
  formatDate: (value?: string | null) => string;
}>();
</script>

<template>
  <aside class="trash-page__aside">
    <section>
      <strong>存储释放概览</strong>
      <div class="trash-page__ring"><span>{{ storagePercent }}%</span></div>
      <p>已用 {{ usedStorageText }}</p>
    </section>
    <section>
      <strong>清理建议</strong>
      <p>及时恢复重要文件</p>
      <p>永久删除过期文件</p>
      <p>定期清理回收站</p>
    </section>
    <section>
      <strong>最早删除</strong>
      <article v-for="doc in docs.slice(0, 3)" :key="doc.docUid">
        <b>{{ doc.title }}</b>
        <small>{{ formatDate(doc.deletedAt) }}</small>
      </article>
    </section>
  </aside>
</template>
