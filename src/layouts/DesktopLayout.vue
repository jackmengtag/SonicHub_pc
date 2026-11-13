<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import AppSidebar from '../components/AppSidebar.vue';
import AppTopbar from '../components/AppTopbar.vue';
import PlayerBar from '../components/PlayerBar.vue';
import { getConversations } from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, formatDuration } from '../utils/format';

const auth = useAuthStore();
const player = usePlayerStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const conversationUnread = ref(0);
const scroller = ref<HTMLElement | null>(null);

const name = computed(() => auth.user?.display_name || '音乐人');
const avatar = computed(() => auth.user?.avatar || 'c6');
const credits = computed(() => auth.me?.credits.available || 0);
const unread = computed(() => (auth.me?.unread_notifications || 0) + conversationUnread.value);
const title = computed(() => String(route.meta.title || 'AI 音乐社区'));
const eyebrow = computed(() => String(route.meta.eyebrow || 'SONICHUB'));
const noRail = computed(() => ['messages', 'create', 'player'].includes(String(route.name)));

async function loadAccount() {
  try {
    if (!auth.me) await auth.loadMe();
  } catch (error) {
    ui.showError(error);
  }
  try {
    const result = await getConversations();
    conversationUnread.value = result.items.reduce((total, item) => total + item.unread, 0);
  } catch {
    conversationUnread.value = 0;
  }
}

async function logout() {
  player.reset();
  await auth.logout();
  await router.replace({ name: 'login' });
}

function keyboard(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    void router.push({ name: 'search' });
    return;
  }
  if (!editing && event.code === 'Space' && (player.current || player.queue.length)) {
    event.preventDefault();
    void player.toggle();
  }
}

watch(() => route.fullPath, async (current, previous) => {
  await nextTick();
  scroller.value?.scrollTo({ top: 0 });
  if (previous?.startsWith('/messages') && !current.startsWith('/messages')) void loadAccount();
});

onMounted(() => {
  void loadAccount();
  window.addEventListener('keydown', keyboard);
});
onUnmounted(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <div class="app" :class="{ 'no-rail': noRail }">
    <AppSidebar :name="name" :avatar="avatar" :credits="credits" :unread="unread" @logout="logout" />
    <section class="main">
      <AppTopbar
        :title="title"
        :eyebrow="eyebrow"
        :name="name"
        :avatar="avatar"
        :unread="unread"
        @search="router.push({ name: 'search' })"
        @messages="router.push({ name: 'messages' })"
        @profile="router.push({ name: 'profile' })"
      />
      <main ref="scroller" class="view-scroll"><RouterView /></main>
    </section>

    <aside v-if="!noRail" class="right-rail" aria-label="播放与创作信息">
      <section class="rail-card">
        <div class="rail-head"><h3>正在播放</h3><span class="eyebrow">NOW PLAYING</span></div>
        <button v-if="player.current" class="rail-now-card" type="button" @click="router.push({ name: 'player', params: { workId: player.current.id } })">
          <div class="cover" :class="coverClass(player.current.cover, player.current.id)"><span class="cover-vinyl" /></div>
          <div class="rail-now-main"><b>{{ player.current.title }}</b><span>{{ player.current.owner_name }}</span></div>
          <AppIcon :name="player.playing ? 'pause' : 'play'" size="sm" />
        </button>
        <div v-else class="rail-empty">还没有播放记录。从发现或广场选择一首作品，音频会在页面切换时持续播放。</div>
        <div v-if="player.current" class="rail-playback">
          <div class="progress" @click.stop><i :style="{ width: `${player.progress}%` }" /></div>
          <div class="progress-time"><span>{{ formatDuration(player.currentTime) }}</span><span>{{ formatDuration(player.duration || player.current.duration_seconds) }}</span></div>
          <button class="btn btn-ghost sm full" type="button" @click="player.toggle()"><AppIcon :name="player.playing ? 'pause' : 'play'" size="sm" />{{ player.playing ? '暂停' : '继续播放' }}</button>
        </div>
      </section>

      <section class="rail-card rail-note-card">
        <p class="eyebrow accent">SONIC LAB</p>
        <h3>把一句灵感变成作品</h3>
        <p class="rail-note">选择风格、时长与人声，获取真实积分报价后提交生成。任务进度与音频均来自音乐生成服务。</p>
        <button class="btn btn-primary sm full" type="button" @click="router.push({ name: 'create' })"><AppIcon name="sparkles" size="sm" />开始写歌</button>
      </section>

      <section class="rail-card">
        <div class="rail-head"><h3>我的创作</h3><span class="mono">{{ credits }} 积分</span></div>
        <p class="rail-note">管理生成作品、设置可见范围，或发布到社区与其他音乐人交流。</p>
        <button class="menu-row" type="button" @click="router.push({ name: 'works' })"><AppIcon name="music" size="sm" />我的作品<AppIcon name="chevron-right" size="sm" /></button>
        <button class="menu-row" type="button" @click="router.push({ name: 'credits' })"><AppIcon name="star" size="sm" />积分中心<AppIcon name="chevron-right" size="sm" /></button>
      </section>
    </aside>

    <PlayerBar />
  </div>
</template>
