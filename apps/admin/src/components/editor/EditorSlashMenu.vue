<script setup lang="ts">
import type { CSSProperties } from "vue";
import type { InsertCommand } from "./editor-types";

defineProps<{
  menuStyle: CSSProperties;
}>();

const emit = defineEmits<{
  run: [command: InsertCommand];
}>();
</script>

<template>
  <div class="chendoc-editor__slash" :style="menuStyle">
    <div class="chendoc-editor__slash-group">
      <span>插入</span>
      <button type="button" @click="emit('run', 'image')">图片 /tp</button>
      <button type="button" @click="emit('run', 'video')">视频 /sp</button>
      <button type="button" @click="emit('run', 'table')">表格</button>
      <button type="button" @click="emit('run', 'hr')">分割线</button>
      <button type="button" @click="emit('run', 'link')">链接</button>
    </div>
    <div class="chendoc-editor__slash-group">
      <span>段落</span>
      <button type="button" @click="emit('run', 'paragraph')">正文</button>
      <button type="button" @click="emit('run', 'h1')">一级标题</button>
      <button type="button" @click="emit('run', 'h2')">二级标题</button>
      <button type="button" @click="emit('run', 'h3')">三级标题</button>
      <button type="button" @click="emit('run', 'quote')">引用</button>
      <button type="button" @click="emit('run', 'code')">代码块</button>
    </div>
    <div class="chendoc-editor__slash-group">
      <span>列表</span>
      <button type="button" @click="emit('run', 'bullet')">无序列表</button>
      <button type="button" @click="emit('run', 'ordered')">有序列表</button>
      <button type="button" @click="emit('run', 'task')">待办列表</button>
    </div>
    <div class="chendoc-editor__slash-group chendoc-editor__slash-group--compact">
      <span>默认字号</span>
      <button type="button" @click="emit('run', 'size15')">15</button>
      <button type="button" @click="emit('run', 'size16')">16</button>
      <button type="button" @click="emit('run', 'size18')">18</button>
      <button type="button" @click="emit('run', 'size20')">20</button>
    </div>
  </div>
</template>
