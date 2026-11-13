<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppSprite from './components/AppSprite.vue';
import AppToast from './components/AppToast.vue';
</script>

<template>
  <AppSprite />
  <RouterView />
  <AppToast />
</template>
