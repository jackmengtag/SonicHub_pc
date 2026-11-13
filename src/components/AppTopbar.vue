<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { coverClass, initial } from '../utils/format';

withDefaults(defineProps<{
  title: string;
  eyebrow: string;
  name?: string;
  avatar?: string;
  unread?: number;
}>(), { name: '音乐人', avatar: 'c6', unread: 0 });

defineEmits<{ search: []; messages: []; profile: [] }>();
</script>

<template>
  <header class="topbar">
    <div class="topbar-title">
      <p class="eyebrow">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
    </div>
    <div class="topbar-actions">
      <button class="search-pill" type="button" @click="$emit('search')">
        <AppIcon name="search" /><span>搜索歌曲、音乐人、风格</span><kbd>⌘K</kbd>
      </button>
      <button class="icon-btn" type="button" title="通知" @click="$emit('messages')">
        <AppIcon name="bell" /><span v-if="unread" class="dot" />
      </button>
      <button class="avatar sm" :class="coverClass(avatar, name)" type="button" title="我的" @click="$emit('profile')">{{ initial(name) }}</button>
    </div>
  </header>
</template>
