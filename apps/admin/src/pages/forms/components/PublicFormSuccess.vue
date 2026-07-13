<script setup lang="ts">
defineProps<{
  exclusiveEntries: Array<[string, string]>;
  submittedEntries: Array<readonly [string, string]>;
}>();
</script>

<template>
  <section class="public-form-card public-form-success" aria-live="polite">
    <div class="public-form-success__icon" aria-hidden="true">✓</div>
    <h2>提交成功</h2>
    <p>感谢您的填写，数据已收到</p>
    <div v-if="exclusiveEntries.length" class="public-form-exclusive">
      <h3>您的专属信息</h3>
      <dl>
        <template v-for="([label, value]) in exclusiveEntries" :key="label">
          <dt>{{ label }}</dt><dd>{{ value }}</dd>
        </template>
      </dl>
    </div>
    <div v-if="submittedEntries.length" class="public-form-summary">
      <h3>您的填写</h3>
      <dl>
        <template v-for="([label, value]) in submittedEntries" :key="label">
          <dt>{{ label }}</dt><dd>{{ value }}</dd>
        </template>
      </dl>
    </div>
  </section>
</template>
