<script setup lang="ts">
import { ref } from "vue";
import { Search, Trash2 } from "lucide-vue-next";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { dangerDeleteDocApi, getDangerDocApi } from "../../api/settings";
import "./css/danger.css";

const id = ref("");
const doc = ref<{ docUid: string; title: string; createdAt: string; updatedAt: string; shareCode?: number | null; deletedAt?: string | null } | null>(null);
const error = ref("");
const confirmOpen = ref(false);

async function query() {
  error.value = "";
  doc.value = null;
  try {
    doc.value = (await getDangerDocApi(id.value.trim())).doc;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "查询失败";
  }
}

async function remove() {
  if (!doc.value) return;
  await dangerDeleteDocApi(doc.value.docUid);
  await query();
}
</script>

<template>
  <section class="danger-page">
    <div class="danger-page__head">
      <h1>文档删除</h1>
      <p>输入 doc_uid 查询并软删除文档。操作会写入日志，不会自动删除 R2 对象。</p>
    </div>
    <form class="danger-page__search cd-card" @submit.prevent="query">
      <label class="cd-label">
        doc_uid
        <input v-model.trim="id" class="cd-input" required minlength="16" maxlength="32" />
      </label>
      <button class="cd-button" type="submit"><Search :size="16" />查询</button>
    </form>
    <p v-if="error" class="cd-error">{{ error }}</p>
    <article v-if="doc" class="danger-page__result cd-card">
      <dl>
        <div><dt>标题</dt><dd>{{ doc.title }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ new Date(doc.createdAt).toLocaleString() }}</dd></div>
        <div><dt>更新时间</dt><dd>{{ new Date(doc.updatedAt).toLocaleString() }}</dd></div>
        <div><dt>分享编号</dt><dd>{{ doc.shareCode ? `/r/${doc.shareCode}` : "未分享" }}</dd></div>
        <div><dt>删除状态</dt><dd>{{ doc.deletedAt ? "已删除" : "未删除" }}</dd></div>
      </dl>
      <button class="cd-button danger" type="button" :disabled="!!doc.deletedAt" @click="confirmOpen = true"><Trash2 :size="16" />删除该文档</button>
    </article>
    <ConfirmDialog v-model="confirmOpen" danger title="二次确认删除" message="确认软删除这篇文档？操作会记录到 operation_logs。" confirm-text="确认删除" @confirm="remove" />
  </section>
</template>
