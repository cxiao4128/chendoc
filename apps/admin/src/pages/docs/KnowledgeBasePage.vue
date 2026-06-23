<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Search } from "lucide-vue-next";
import { listDocsApi, type DocSummary } from "../../api/docs";
import { useWorkspaceRoutes } from "../../composables/useWorkspaceRoutes";
import "./css/utility-pages.css";

const { docPath } = useWorkspaceRoutes();
const keyword = ref("");
const activeTag = ref("all");
const knowledgeDocs = ref<DocSummary[]>([]);

function tagsOf(doc: { tags?: string[] | string | null }) {
  if (Array.isArray(doc.tags)) return doc.tags;
  if (typeof doc.tags !== "string") return [];
  try { return JSON.parse(doc.tags) as string[]; } catch { return []; }
}

const tagDirectory = computed(() => Array.from(new Set(knowledgeDocs.value.flatMap(tagsOf))).sort((a, b) => a.localeCompare(b, "zh-CN")));

const filteredDocs = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  const source = knowledgeDocs.value.filter((doc) => (doc.status === "published" || doc.shareEnabled) && (activeTag.value === "all" || tagsOf(doc).includes(activeTag.value)));
  if (!q) return source;
  return source.filter((doc) => doc.title.toLowerCase().includes(q) || String(doc.shareCode || "").includes(q));
});

const sharedDocs = computed(() => filteredDocs.value.filter((doc) => doc.shareCode && doc.shareEnabled));
const privateDocs = computed(() => filteredDocs.value.filter((doc) => !doc.shareEnabled));
onMounted(async () => {
  const collected: DocSummary[] = [];
  for (let page = 1; page <= 200; page += 1) {
    const response = await listDocsApi({ page, pageSize: 50 });
    collected.push(...response.docs);
    if (!response.pagination?.hasMore) break;
  }
  knowledgeDocs.value = collected;
});
</script>

<template>
  <section class="utility-page">
    <header>
      <div>
        <h1>知识库</h1>
        <p>按已发布和已分享文档生成真实知识入口。</p>
      </div>
    </header>

    <form class="utility-page__search" @submit.prevent>
      <Search :size="16" />
      <input v-model.trim="keyword" placeholder="搜索标题或分享码" />
    </form>

    <nav class="utility-page__directory" aria-label="知识目录">
      <button type="button" :class="{ active: activeTag === 'all' }" @click="activeTag = 'all'">全部</button>
      <button v-for="tag in tagDirectory" :key="tag" type="button" :class="{ active: activeTag === tag }" @click="activeTag = tag">{{ tag }}</button>
    </nav>

    <div class="utility-page__columns">
      <section>
        <strong>公开知识</strong>
        <RouterLink v-for="doc in sharedDocs" :key="doc.docUid" :to="docPath(doc.docUid)">
          {{ doc.title }}<span>/r/{{ doc.shareCode }}</span>
        </RouterLink>
        <p v-if="!sharedDocs.length">暂无公开知识。</p>
      </section>
      <section>
        <strong>已发布文档</strong>
        <RouterLink v-for="doc in privateDocs" :key="doc.docUid" :to="docPath(doc.docUid)">
          {{ doc.title }}<span>{{ new Date(doc.updatedAt).toLocaleDateString() }}</span>
        </RouterLink>
        <p v-if="!privateDocs.length">暂无已发布文档。</p>
      </section>
    </div>

  </section>
</template>
