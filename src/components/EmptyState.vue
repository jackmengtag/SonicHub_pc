<script setup lang="ts">
import AppIcon from './AppIcon.vue';

withDefaults(defineProps<{
  title: string;
  description?: string;
  icon?: string;
  loading?: boolean;
  error?: string;
  retryLabel?: string;
}>(), {
  description: '',
  icon: 'music',
  loading: false,
  error: '',
  retryLabel: '重试',
});

defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="loading-box" role="status">
    <span class="spinner" /><span>{{ title || '正在加载…' }}</span>
  </div>
  <div v-else-if="error" class="error-box" role="alert">
    <b>加载失败</b>
    <p>{{ error }}</p>
    <button class="btn btn-ghost sm" type="button" @click="$emit('retry')">{{ retryLabel }}</button>
  </div>
  <div v-else class="empty-box">
    <div class="empty-icon"><AppIcon :name="icon" size="lg" /></div>
    <b>{{ title }}</b>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
