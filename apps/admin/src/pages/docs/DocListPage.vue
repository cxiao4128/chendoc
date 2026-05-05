<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Plus, Search, Trash2 } from "lucide-vue-next";
import EmptyState from "../../components/common/EmptyState.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import { useDocStore } from "../../stores/doc";
import "./doc-list.css";

const route = useRoute();
const router = useRouter();
const docs = useDocStore();
const isMobile = useIsMobileViewport();

const query = computed(() => String(route.query.q || "").trim());
const visibleDocs = computed(() => docs.docs);
const searchKeyword = ref(query.value);

async function createDoc() {
  const doc = await docs.createDoc("未命名文档");
  router.push(`/admin/docs/${doc.id}`);
}

function sharePath(doc: { shareCode?: number | null; customSlug?: string | null }) {
  if (doc.customSlug) return `/r/${doc.customSlug}`;
  return doc.shareCode ? `/r/${doc.shareCode}` : "未分享";
}

function shareStatusText(doc: { shareCode?: number | null; customSlug?: string | null; shareEnabled?: boolean | null; shareReviewStatus?: string | null }) {
  if (!doc.shareCode) return "未分享";
  if (doc.shareEnabled) return sharePath(doc);
  if (doc.shareReviewStatus === "pending") return `审核中 · ${doc.shareCode}`;
  if (doc.shareReviewStatus === "rejected") return `未通过 · ${doc.shareCode}`;
  return sharePath(doc);
}

function load() {
  void docs.loadList(query.value);
}

function statusText(status: string) {
  return status === "published" ? "已发布" : "草稿";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function submitSearch() {
  const value = searchKeyword.value.trim();
  router.push({ path: "/admin/docs", query: value ? { q: value } : {} });
}

onMounted(load);
watch(() => route.query.q, load);
watch(query, (value) => {
  searchKeyword.value = value;
});
</script>

<template>
  <section class="doc-list-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <div class="doc-list-page__mobile-hero">
        <span>内容库</span>
        <h1>文档空间</h1>
        <p>在手机上快速搜索、继续编辑和切换最近文档，浏览结构更接近原生内容 app。</p>
      </div>

      <form class="doc-list-page__mobile-search" @submit.prevent="submitSearch">
        <Search :size="17" />
        <input v-model.trim="searchKeyword" aria-label="搜索文档" placeholder="搜索标题或输入分享路径" />
        <button type="submit">搜索</button>
      </form>

      <div class="doc-list-page__mobile-actions">
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        <RouterLink class="cd-button" to="/admin/trash"><Trash2 :size="16" />回收站</RouterLink>
      </div>

      <div v-if="docs.loadingList" class="doc-list-page__skeleton is-mobile">
        <span v-for="i in 5" :key="i" class="cd-skeleton" />
      </div>

      <EmptyState v-else-if="!visibleDocs.length" title="没有找到文档" description="可以新建一篇文档，或换个关键词搜索。">
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
      </EmptyState>

      <div v-else class="doc-list-page__mobile-list">
        <RouterLink v-for="doc in visibleDocs" :key="doc.id" :to="`/admin/docs/${doc.id}`" class="doc-list-page__mobile-card">
          <div class="doc-list-page__mobile-row">
            <strong>{{ doc.title }}</strong>
            <span>{{ statusText(doc.status) }}</span>
          </div>
          <p>{{ formatDate(doc.updatedAt) }}</p>
          <code>{{ shareStatusText(doc) }}</code>
        </RouterLink>
      </div>
    </template>

    <template v-else>
      <div class="doc-list-page__head">
        <div>
          <h1>文档</h1>
          <p v-if="query"><Search :size="14" /> 搜索：{{ query }}</p>
          <p v-else>只返回标题、状态、更新时间和分享状态，正文按需进入文档后加载。</p>
        </div>
        <div class="doc-list-page__actions">
          <RouterLink class="cd-button" to="/admin/trash"><Trash2 :size="16" />回收站</RouterLink>
          <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
        </div>
      </div>

      <div v-if="docs.loadingList" class="doc-list-page__skeleton">
        <span v-for="i in 6" :key="i" class="cd-skeleton" />
      </div>

      <EmptyState v-else-if="!visibleDocs.length" title="没有找到文档" description="可以新建一篇文档，或换个关键词搜索。">
        <button class="cd-button primary" type="button" @click="createDoc"><Plus :size="16" />新建文档</button>
      </EmptyState>

      <div v-else class="doc-list-page__table">
        <RouterLink v-for="doc in visibleDocs" :key="doc.id" :to="`/admin/docs/${doc.id}`" class="doc-list-page__row">
          <strong>{{ doc.title }}</strong>
          <span>{{ statusText(doc.status) }}</span>
          <span>{{ formatDate(doc.updatedAt) }}</span>
          <code>{{ shareStatusText(doc) }}</code>
        </RouterLink>
      </div>
    </template>
  </section>
</template>
