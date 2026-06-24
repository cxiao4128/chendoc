<script setup lang="ts">
import { Copy, ExternalLink, Link2 } from "lucide-vue-next";

const shareEnabled = defineModel<boolean>("shareEnabled", { required: true });
const shareCodeInput = defineModel<string>("shareCodeInput", { required: true });
const sharePassword = defineModel<string>("sharePassword", { required: true });

defineProps<{
  isAdmin: boolean;
  mobile?: boolean;
  share: { shareCode?: number | null; reviewStatus?: string | null } | null;
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

defineEmits<{
  confirmPassword: [];
  clearPassword: [];
  passwordInput: [];
  copy: [];
  resubmit: [];
}>();
</script>

<template>
  <div class="doc-editor-page__share-summary">
    <strong>{{ shareStateText }}</strong>
    <span>谁能访问：{{ shareAccessText }}</span>
    <span>密码：{{ shareHasPassword ? "需要" : "不需要" }}</span>
    <span>失效：{{ shareExpiryText }}</span>
  </div>
  <label class="doc-editor-page__check">
    <input v-model="shareEnabled" type="checkbox" />
    <span>{{ isAdmin ? "公开分享" : "申请公开分享" }}</span>
  </label>
  <label v-if="isAdmin">
    <span>分享数字</span>
    <input :value="shareCodeInput || (share?.shareCode ? String(share.shareCode) : '系统自动分配')" type="text" readonly />
  </label>
  <label>
    <span>访问密码</span>
    <div class="doc-editor-page__password-row">
      <input v-model="sharePassword" type="password" placeholder="不点确认就是无密码" @input="$emit('passwordInput')" />
      <button class="cd-button" type="button" :disabled="shareLoading" @click="$emit('confirmPassword')">确认密码</button>
    </div>
    <button v-if="shareHasPassword" class="doc-editor-page__text-button" type="button" :disabled="shareLoading" @click="$emit('clearPassword')">
      清除当前访问密码
    </button>
  </label>
  <div v-if="shareUrl" class="doc-editor-page__share-card" :class="{ 'is-mobile': mobile }">
    <span>分享链接</span>
    <a :href="shareUrl" target="_blank" rel="noopener noreferrer">
      <Link2 :size="14" />{{ shareUrl }}
    </a>
  </div>
  <div v-else-if="share?.shareCode" class="doc-editor-page__share-card" :class="{ 'is-mobile': mobile }">
    <span>分享数字</span>
    <code>{{ share.shareCode }}</code>
  </div>
  <div v-if="mobile && shareUrl" class="doc-editor-page__mobile-share-actions">
    <button class="cd-button" type="button" :disabled="shareLoading" @click="$emit('copy')">
      <Copy :size="16" />{{ copied ? "已复制" : "复制链接" }}
    </button>
    <a class="cd-button" :href="shareUrl" target="_blank" rel="noopener noreferrer">
      <ExternalLink :size="16" />打开分享页
    </a>
  </div>
  <p class="doc-editor-page__share-status" :class="{ 'is-error': shareStatusIsError }">
    {{ shareMessage }}
  </p>
  <p v-if="shareReviewText" class="doc-editor-page__share-status" :class="{ 'is-error': share?.reviewStatus === 'rejected' }">
    {{ shareReviewText }}
  </p>
  <button v-if="share?.reviewStatus === 'rejected'" class="cd-button primary" type="button" :disabled="shareLoading" @click="$emit('resubmit')">
    修改并重新提交
  </button>
</template>
