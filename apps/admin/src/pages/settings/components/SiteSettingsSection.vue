<script setup lang="ts">defineEmits<{ submit: [] }>();</script>
<template><form class="settings-page__panel settings-page__appearance" @submit.prevent="$emit('submit')"><slot /></form></template>
