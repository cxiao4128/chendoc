<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";
import type { UserDetailTab } from "../../../../features/settings/hooks/useManagedUsers";

defineProps<{
  userDetailTab: UserDetailTab;
}>();

defineEmits<{
  closeUserDetail: [];
  updateUserDetailTab: [value: UserDetailTab];
}>();
</script>

<template>
  <div class="settings-page__user-edit-head">
    <div>
      <small>用户管理 / 编辑用户</small>
      <h2>用户管理 / 编辑用户</h2>
      <p>修改用户信息、角色权限和账户状态。</p>
    </div>
    <button class="cd-button" type="button" @click="$emit('closeUserDetail')">
      <ArrowLeft :size="16" />返回用户列表
    </button>
  </div>
  <div class="settings-page__user-subtabs" aria-label="编辑用户分类">
    <button :class="{ 'is-active': userDetailTab === 'info' }" type="button" @click="$emit('updateUserDetailTab', 'info')">用户信息</button>
    <button :class="{ 'is-active': userDetailTab === 'roles' }" type="button" @click="$emit('updateUserDetailTab', 'roles')">角色权限</button>
    <button :class="{ 'is-active': userDetailTab === 'login' }" type="button" @click="$emit('updateUserDetailTab', 'login')">登录日志</button>
    <button :class="{ 'is-active': userDetailTab === 'actions' }" type="button" @click="$emit('updateUserDetailTab', 'actions')">操作记录</button>
  </div>
</template>
