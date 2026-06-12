<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Copy, ExternalLink, X } from "lucide-vue-next";
import { updateShareApi, type ShareItem } from "../../api/shares";
import { useShare } from "../../composables/useShare";
import "./share-dialog.css";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ docId: number; title: string }>();
const share = ref<ShareItem | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const { ensureShare } = useShare();

const shareUrl = computed(() => share.value ? `${location.origin}/r/${share.value.shareCode}` : "");
const canUseLink = computed(() => !!share.value?.isEnabled && !!shareUrl.value);

watch(open, async (value) => {
  if (!value) return;
  loading.value = true;
  error.value = "";
  try {
    share.value = await ensureShare(props.docId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "生成分享失败";
  } finally {
    loading.value = false;
  }
});

async function copy() {
  if (canUseLink.value) await navigator.clipboard.writeText(shareUrl.value);
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
          <code :class="{ 'is-disabled': !share.isEnabled }">{{ share.isEnabled ? shareUrl : "分享未开启" }}</code>
          <button class="cd-button" type="button" :disabled="!canUseLink || saving" @click="copy"><Copy :size="16" />复制</button>
          <a v-if="canUseLink" class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="16" />打开</a>
          <button v-else class="cd-button" type="button" disabled><ExternalLink :size="16" />打开</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
