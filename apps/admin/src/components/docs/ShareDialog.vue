<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Copy, ExternalLink, X } from "lucide-vue-next";
import { updateShareApi, type ShareItem } from "@/services/api";
import { useShare } from "../../composables/useShare";
import { absoluteShareUrlOf } from "../../utils/sharePath";
import "./share-dialog.css";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ docUid: string; title: string }>();
const share = ref<ShareItem | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const copySuccess = ref(false);
const copyMessage = ref("");
const { ensureShare } = useShare();

const shareUrl = computed(() => absoluteShareUrlOf(share.value));
const isExpired = computed(() => !!share.value?.expireAt && new Date(share.value.expireAt).getTime() <= Date.now());
const canUseLink = computed(() => !!share.value?.isEnabled
  && share.value.reviewStatus !== "pending"
  && share.value.reviewStatus !== "rejected"
  && !isExpired.value
  && !!shareUrl.value);
const stateText = computed(() => {
  if (!share.value?.isEnabled) return "已关闭";
  if (share.value.reviewStatus === "pending") return "待审核";
  if (share.value.reviewStatus === "rejected") return "审核未通过";
  if (isExpired.value) return "已失效";
  return "已公开";
});
const accessText = computed(() => share.value?.hasPassword ? "持有链接和密码的人" : "持有链接的人");
const expiryText = computed(() => share.value?.expireAt ? new Date(share.value.expireAt).toLocaleString() : "长期有效");
const unavailableText = computed(() => {
  if (share.value?.reviewStatus === "pending") return "审核通过后可打开和复制。";
  if (share.value?.reviewStatus === "rejected") return `审核未通过${share.value.reviewNote ? `：${share.value.reviewNote}` : "，请修改后重新提交"}。`;
  if (isExpired.value) return "链接已失效，请更新有效期。";
  if (!share.value?.isEnabled) return "开启公开分享后可打开和复制。";
  return "";
});

watch(open, async (value) => {
  if (!value) return;
  loading.value = true;
  error.value = "";
  try {
    share.value = await ensureShare(props.docUid);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "生成分享失败";
  } finally {
    loading.value = false;
  }
});

async function copy() {
  if (canUseLink.value) {
    await navigator.clipboard.writeText(shareUrl.value);
    copySuccess.value = true;
    copyMessage.value = `已复制 · ${accessText.value} · ${expiryText.value}`;
    setTimeout(() => {
      copySuccess.value = false;
      copyMessage.value = "";
    }, 2400);
  }
}

async function setEnabled(isEnabled: boolean) {
  if (!share.value) return;
  saving.value = true;
  error.value = "";
  try {
    await updateShareApi(share.value.id, { isEnabled });
    share.value = { ...share.value, isEnabled };
  } catch (err) {
    error.value = err instanceof Error ? err.message : "更新分享失败";
  } finally {
    saving.value = false;
  }
}

function onEnabledChange(event: Event) {
  const target = event.target as HTMLInputElement;
  void setEnabled(target.checked);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="share-dialog" role="dialog" aria-modal="true">
      <section class="share-dialog__panel">
        <button class="share-dialog__close" type="button" aria-label="关闭" @click="open = false">
          <X :size="18" />
        </button>
        <h2>分享文档</h2>
        <p>{{ title }}</p>
        <div v-if="loading" class="cd-skeleton share-dialog__skeleton" />
        <div v-else-if="error" class="cd-error">{{ error }}</div>
        <div v-else-if="share" class="share-dialog__box">
          <label class="share-dialog__toggle">
            <input :checked="share.isEnabled" :disabled="saving" type="checkbox" @change="onEnabledChange" />
            <span>{{ share.isEnabled ? "公开分享已开启" : "公开分享已关闭" }}</span>
          </label>
          <dl class="share-dialog__summary">
            <div><dt>状态</dt><dd>{{ stateText }}</dd></div>
            <div><dt>谁能访问</dt><dd>{{ accessText }}</dd></div>
            <div><dt>密码</dt><dd>{{ share.hasPassword ? "需要" : "不需要" }}</dd></div>
            <div><dt>失效</dt><dd>{{ expiryText }}</dd></div>
          </dl>
          <code :class="{ 'is-disabled': !share.isEnabled }">{{ share.isEnabled ? shareUrl : "分享未开启" }}</code>
          <button class="cd-button" type="button" :disabled="!canUseLink || saving" @click="copy">
            <Check v-if="copySuccess" :size="16" />
            <Copy v-else :size="16" />
            {{ copySuccess ? "已复制" : "复制链接" }}
          </button>
          <a v-if="canUseLink" class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="16" />打开</a>
          <button v-else class="cd-button" type="button" disabled><ExternalLink :size="16" />打开</button>
          <p v-if="copyMessage || unavailableText" class="share-dialog__feedback">{{ copyMessage || unavailableText }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
