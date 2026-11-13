<script setup lang="ts">
import { RouterLink } from 'vue-router';
import AppIcon from './AppIcon.vue';
import { coverClass, initial } from '../utils/format';

withDefaults(defineProps<{
  name?: string;
  avatar?: string;
  credits?: number;
  unread?: number;
}>(), { name: '音乐人', avatar: 'c6', credits: 0, unread: 0 });

defineEmits<{ logout: [] }>();

interface NavItem {
  route: string;
  label: string;
  icon: string;
  key?: string;
  badge?: string;
}

const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'EXPLORE',
    items: [
      { route: 'discover', label: '发现', icon: 'compass', key: '1' },
      { route: 'plaza', label: '广场', icon: 'grid', key: '2' },
      { route: 'search', label: '搜索', icon: 'search', key: '3' },
    ],
  },
  {
    label: 'CREATE',
    items: [
      { route: 'create', label: '写歌', icon: 'sparkles', badge: 'AI' },
      { route: 'works', label: '我的作品', icon: 'music' },
      { route: 'credits', label: '积分中心', icon: 'star' },
    ],
  },
  {
    label: 'SOCIAL',
    items: [
      { route: 'messages', label: '消息', icon: 'bell' },
      { route: 'profile', label: '我的', icon: 'user' },
      { route: 'verify', label: '音乐人认证', icon: 'shield' },
    ],
  },
];
</script>

<template>
  <aside class="sidebar">
    <RouterLink class="sidebar-brand" :to="{ name: 'discover' }" aria-label="SonicHub 首页">
      <div class="brand-mark"><span /><span /><span /><span /></div>
      <div><p class="brand-name">SonicHub</p><p class="brand-sub">AI MUSIC COMMUNITY</p></div>
    </RouterLink>

    <nav class="side-nav" aria-label="主导航">
      <template v-for="group in groups" :key="group.label">
        <p class="nav-label">{{ group.label }}</p>
        <RouterLink
          v-for="item in group.items"
          :key="item.route"
          class="nav-item"
          active-class="is-active"
          :to="{ name: item.route }"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
          <em v-if="item.key" class="nav-kbd">{{ item.key }}</em>
          <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
          <em v-if="item.route === 'messages' && unread" class="nav-count">{{ unread > 99 ? '99+' : unread }}</em>
        </RouterLink>
      </template>
    </nav>

    <div class="sidebar-user">
      <RouterLink class="avatar lg" :class="coverClass(avatar, name)" :to="{ name: 'profile' }">{{ initial(name) }}</RouterLink>
      <div class="sidebar-user-info">
        <b>{{ name }}</b>
        <span><AppIcon name="star" size="sm" /><em>{{ credits }}</em> 创作积分</span>
      </div>
      <button class="icon-btn tiny" type="button" title="退出登录" @click="$emit('logout')"><AppIcon name="arrow-right" size="sm" /></button>
    </div>
  </aside>
</template>
