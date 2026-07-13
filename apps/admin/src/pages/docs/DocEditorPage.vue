<script setup lang="ts">
import DocEditorShell from "./components/DocEditorShell.vue";
import DocEditorDesktopPageView from "./components/DocEditorDesktopPageView.vue";
import DocEditorMobilePageView from "./components/DocEditorMobilePageView.vue";
import { useDocEditorPage } from "../../features/editor/hooks/useDocEditorPage";
import { provideDocEditorPageContext } from "./docEditorPageContext";
import "./css/doc-editor.css";

const page = useDocEditorPage();
provideDocEditorPageContext(page);
</script>

<template>
  <section class="doc-editor-page" :class="{ 'is-mobile': page.isMobile }">
    <DocEditorShell />
    <DocEditorMobilePageView v-if="page.isMobile" />
    <DocEditorDesktopPageView v-else />
  </section>
</template>
