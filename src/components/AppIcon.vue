<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: 'sm' | 'lg' }>(), { size: undefined });
</script>

<template>
  <svg class="ic" :class="size === 'sm' ? 'tiny' : size" aria-hidden="true">
    <use :href="`#i-${name}`" />
  </svg>
</template>
