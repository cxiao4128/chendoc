<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Copy, Plus, Trash2, XCircle } from "lucide-vue-next";
import {
  createInviteApi,
  createInviteBatchApi,
  deleteInviteApi,
  disableInviteApi,
  listInvitesApi,
  type InviteItem
} from "../../api/invites";
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useIsMobileViewport } from "../../composables/useViewport";
import "./css/invite.css";

const invites = ref<InviteItem[]>([]);
const loading = ref(false);
const error = ref("");
const copied = ref("");
const batchCount = ref(5);
const expireAt = ref("");
const deleteTarget = ref<InviteItem | null>(null);
const deleteOpen = ref(false);
const isMobile = useIsMobileViewport();

const statusLabel: Record<string, string> = {
  unused: "未使用",
  used: "已使用",
  disabled: "已禁用",
  expired: "已过期"
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

async function load() {
  loading.value = true;
  try {
    invites.value = (await listInvitesApi()).invites;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function createOne() {
  await createInviteApi(expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
  await load();
}

async function createBatch() {
  await createInviteBatchApi(batchCount.value, expireAt.value ? new Date(expireAt.value).toISOString() : undefined);
  await load();
}

async function copy(code: string) {
  await navigator.clipboard.writeText(code);
  copied.value = code;
  window.setTimeout(() => {
    if (copied.value === code) copied.value = "";
  }, 1800);
}

async function disable(item: InviteItem) {
  await disableInviteApi(item.id);
  await load();
}

async function remove() {
  if (!deleteTarget.value) return;
  await deleteInviteApi(deleteTarget.value.id);
  deleteTarget.value = null;
  deleteOpen.value = false;
  await load();
}

function askDelete(item: InviteItem) {
  deleteTarget.value = item;
  deleteOpen.value = true;
}

onMounted(load);
</script>

<template>
  <section class="invite-page" :class="{ 'is-mobile': isMobile }">
    <template v-if="isMobile">
      <div class="invite-page__mobile-hero">
        <span>通行凭证</span>
        <h1>注册卡密</h1>
        <p>把生成、复制和状态管理整合成触控卡片，手机端不用再横向拖表格。</p>
      </div>

      <div class="invite-page__tools cd-card is-mobile">
        <label class="cd-label">过期时间<input v-model="expireAt" class="cd-input" type="datetime-local" /></label>
        <label class="cd-label">批量数量<input v-model.number="batchCount" class="cd-input" type="number" min="1" max="100" /></label>
        <button class="cd-button primary" type="button" @click="createOne"><Plus :size="16" />生成单个</button>
        <button class="cd-button" type="button" @click="createBatch"><Plus :size="16" />批量生成</button>
      </div>

      <p v-if="error" class="cd-error">{{ error }}</p>

      <div v-if="loading" class="invite-page__loading is-mobile">
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
        <span class="cd-skeleton" />
      </div>

      <div v-else class="invite-page__mobile-list">
        <article v-for="item in invites" :key="item.id" class="invite-page__mobile-card">
          <div class="invite-page__mobile-head">
            <code>{{ item.code }}</code>
            <span :class="`invite-page__status is-${item.status}`">{{ statusLabel[item.status] }}</span>
          </div>
          <div class="invite-page__mobile-meta">
            <div><small>创建时间</small><span>{{ formatDate(item.createdAt) }}</span></div>
            <div><small>过期时间</small><span>{{ item.expireAt ? formatDate(item.expireAt) : "长期" }}</span></div>
            <div><small>使用者</small><span>{{ item.usedByUsername || "-" }}</span></div>
            <div><small>使用时间</small><span>{{ formatDate(item.usedAt) }}</span></div>
          </div>
          <div class="invite-page__mobile-actions">
            <button type="button" @click="copy(item.code)"><Copy :size="15" />{{ copied === item.code ? "已复制" : "复制" }}</button>
            <button type="button" :disabled="item.status === 'used'" @click="disable(item)"><XCircle :size="15" />禁用</button>
            <button type="button" @click="askDelete(item)"><Trash2 :size="15" />删除</button>
          </div>
        </article>
      </div>
    </template>

    <template v-else>
      <div class="invite-page__head">
        <div>
          <h1>注册卡密管理</h1>
          <p>注册卡密默认一次性使用，注册成功后会绑定使用者。</p>
        </div>
      </div>
      <div class="invite-page__tools cd-card">
        <label class="cd-label">过期时间<input v-model="expireAt" class="cd-input" type="datetime-local" /></label>
        <label class="cd-label">批量数量<input v-model.number="batchCount" class="cd-input" type="number" min="1" max="100" /></label>
        <button class="cd-button primary" type="button" @click="createOne"><Plus :size="16" />生成单个</button>
        <button class="cd-button" type="button" @click="createBatch"><Plus :size="16" />批量生成</button>
      </div>
      <p v-if="error" class="cd-error">{{ error }}</p>
      <div class="invite-page__table">
        <div class="invite-page__row invite-page__row--head">
          <span>注册卡密</span><span>状态</span><span>创建时间</span><span>过期时间</span><span>使用者</span><span>使用时间</span><span>操作</span>
        </div>
        <div v-if="loading" class="invite-page__loading"><span class="cd-skeleton" /></div>
        <div v-for="item in invites" v-else :key="item.id" class="invite-page__row">
          <code>{{ item.code }}</code>
          <span :class="`invite-page__status is-${item.status}`">{{ statusLabel[item.status] }}</span>
          <span>{{ formatDate(item.createdAt) }}</span>
          <span>{{ item.expireAt ? formatDate(item.expireAt) : "长期" }}</span>
          <span>{{ item.usedByUsername || "-" }}</span>
          <span>{{ formatDate(item.usedAt) }}</span>
          <span class="invite-page__actions">
            <button type="button" :aria-label="`复制注册卡密 ${item.code}`" @click="copy(item.code)">
              <Copy :size="15" />
            </button>
            <button type="button" aria-label="禁用注册卡密" :disabled="item.status === 'used'" @click="disable(item)">
              <XCircle :size="15" />
            </button>
            <button type="button" aria-label="删除注册卡密" @click="askDelete(item)">
              <Trash2 :size="15" />
            </button>
            <small v-if="copied === item.code">已复制</small>
          </span>
        </div>
      </div>
    </template>
    <ConfirmDialog v-model="deleteOpen" danger title="删除注册卡密" message="删除后该卡密不可恢复。确认继续吗？" confirm-text="删除" @confirm="remove" />
  </section>
</template>
