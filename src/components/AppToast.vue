<script setup lang="ts">
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="toast" :class="{ 'is-show': ui.visible }" role="status" aria-live="polite">
    {{ ui.message }}
  </div>
</template>
