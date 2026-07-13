<script setup lang="ts">
import { computed } from "vue";
import { Copy, ExternalLink, Link2 } from "lucide-vue-next";
import type { ShareItem } from "@/services/api";

const shareEnabled = defineModel<boolean>("shareEnabled", { required: true });
const _shareCodeInput = defineModel<string>("shareCodeInput", { required: true });
const customSlugInput = defineModel<string>("customSlugInput", { required: true });
const sharePassword = defineModel<string>("sharePassword", { required: true });

const props = defineProps<{
  isAdmin: boolean;
  mobile?: boolean;
  share: ShareItem | null;
  shareUrl: string;
  shareLoading: boolean;
  shareHasPassword: boolean;
  shareStateText: string;
  shareAccessText: string;
  shareExpiryText: string;
  shareMessage: string;
  shareStatusIsError: boolean;
  shareReviewText: string;
  copied?: boolean;
}>();

const summaryTone = computed(() => {
  if (props.share?.reviewStatus === "rejected") return "is-danger";
  if (props.share?.reviewStatus === "pending") return "is-warning";
  if (shareEnabled.value) return "is-success";
  return "is-neutral";
});

defineEmits<{
  confirmPassword: [];
  clearPassword: [];
  passwordInput: [];
  saveCustomSlug: [];
  copy: [];
  resubmit: [];
}>();
</script>

<template>
  <div
    class="doc-editor-page__share-summary"
    :class="summaryTone"
    role="status"
    aria-live="polite"
    :aria-busy="shareLoading"
  >
    <strong>{{ shareStateText }}</strong>
    <span>谁能访问：{{ shareAccessText }}</span>
    <span>密码：{{ shareHasPassword ? "需要" : "不需要" }}</span>
    <span>失效：{{ shareExpiryText }}</span>
  </div>
  <label class="doc-editor-page__check">
    <input v-model="shareEnabled" type="checkbox" :disabled="shareLoading" />
    <span>{{ isAdmin ? "公开分享" : "申请公开分享" }}</span>
  </label>
  <label v-if="isAdmin">
    <span>自定义链接码（可选）</span>
    <input
      v-model="customSlugInput"
      type="text"
      name="chendoc-share-custom-slug"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      data-form-type="other"
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
      :disabled="shareLoading"
      placeholder="留空使用系统分配的数字码"
    />
    <button class="cd-button" type="button" :disabled="shareLoading" @click="$emit('saveCustomSlug')">保存链接码</button>
  </label>
  <label>
    <span>访问密码</span>
    <div class="doc-editor-page__password-row">
      <input
        v-model="sharePassword"
        type="password"
        name="chendoc-share-access-password"
        autocomplete="section-doc-share new-password"
        data-form-type="other"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        :disabled="shareLoading"
        placeholder="不点确认就是无密码"
        @input="$emit('passwordInput')"
      />
      <button class="cd-button" type="button" :disabled="shareLoading" @click="$emit('confirmPassword')">确认密码</button>
    </div>
    <button v-if="shareHasPassword" class="doc-editor-page__text-button" type="button" :disabled="shareLoading" @click="$emit('clearPassword')">
      清除当前访问密码
    </button>
  </label>
  <div v-if="share?.shareCode" class="doc-editor-page__share-card" :class="{ 'is-mobile': mobile }">
    <span>系统分享码</span>
    <code>{{ share.shareCode }}</code>
  </div>
  <div v-if="shareUrl" class="doc-editor-page__share-card" :class="{ 'is-mobile': mobile }">
    <span>分享链接</span>
    <a :href="shareUrl" target="_blank" rel="noopener noreferrer">
      <Link2 :size="14" />{{ shareUrl }}
    </a>
  </div>
  <div v-if="mobile && shareUrl" class="doc-editor-page__mobile-share-actions">
    <button class="cd-button" type="button" :disabled="shareLoading" @click="$emit('copy')">
      <Copy :size="16" />{{ copied ? "已复制" : "复制链接" }}
    </button>
    <a class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
      <ExternalLink :size="16" />打开分享页
    </a>
  </div>
  <p
    class="doc-editor-page__share-status"
    :class="{ 'is-error': shareStatusIsError }"
    :role="shareStatusIsError ? 'alert' : 'status'"
    :aria-live="shareStatusIsError ? 'assertive' : 'polite'"
  >
    {{ shareMessage }}
  </p>
  <p
    v-if="shareReviewText"
    class="doc-editor-page__share-status"
    :class="{ 'is-error': share?.reviewStatus === 'rejected' }"
    :role="share?.reviewStatus === 'rejected' ? 'alert' : 'status'"
    :aria-live="share?.reviewStatus === 'rejected' ? 'assertive' : 'polite'"
  >
    {{ shareReviewText }}
  </p>
  <button v-if="share?.reviewStatus === 'rejected'" class="cd-button primary" type="button" :disabled="shareLoading" @click="$emit('resubmit')">
    修改并重新提交
  </button>
</template>
