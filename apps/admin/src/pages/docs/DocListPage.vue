<script setup lang="ts">
import ConfirmDialog from "../../components/common/ConfirmDialog.vue";
import { useDocListPage } from "../../features/documents/hooks/useDocListPage";
import { provideDocListContext } from "./docListContext";
import DocListDesktopView from "./components/DocListDesktopView.vue";
import DocListMobileView from "./components/DocListMobileView.vue";
import "./css/doc-list.css";

const page = useDocListPage();
provideDocListContext(page);
</script>

<template>
  <section class="doc-list-page" :class="{ 'is-mobile': page.isMobile }">
    <DocListMobileView v-if="page.isMobile" />
    <DocListDesktopView v-else />
    <ConfirmDialog
      v-model="page.bulkDeleteOpen"
      danger
      title="批量删除"
      :message="`确认将选中的 ${page.selectedCount} 篇文档移入回收站吗？`"
      confirm-text="批量删除"
      @confirm="page.doBulkDelete"
    />
  </section>
</template>
