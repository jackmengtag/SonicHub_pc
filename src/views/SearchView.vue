<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import WorkList from '../components/WorkList.vue';
import { followUser, search, unfollowUser } from '../api/modules';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, initial } from '../utils/format';
import type { SearchResult, UserCard, Work } from '../types/api';

const hotSearches = ['江南雨巷', 'Lo-fi', '国风电子', '深夜通勤', '失恋', '纯音乐'];
const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const ui = useUiStore();
const query = ref('');
const result = ref<SearchResult>({ works: [], artists: [] });
const loading = ref(false);
const error = ref('');
const searched = ref(false);
const input = ref<HTMLInputElement | null>(null);
let sequence = 0;

async function run(value = query.value) {
  const q = value.trim();
  query.value = q;
  if (!q) {
    result.value = { works: [], artists: [] };
    searched.value = false;
    error.value = '';
    await nextTick();
    input.value?.focus();
    return;
  }
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  searched.value = true;
  try {
    const data = await search(q);
    if (current !== sequence) return;
    result.value = { works: data.works || [], artists: data.artists || [] };
    if (route.query.q !== q) void router.replace({ name: 'search', query: { q } });
  } catch (reason) {
    if (current === sequence) error.value = ui.errorText(reason);
  } finally {
    if (current === sequence) loading.value = false;
  }
}

function open(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

async function like(work: Work) {
  try { await player.like(work); } catch (reason) { ui.showError(reason); }
}

async function toggleFollow(artist: UserCard) {
  try {
    const data = artist.following ? await unfollowUser(artist.id) : await followUser(artist.id);
    Object.assign(artist, data);
    ui.showToast(data.following ? `已关注 ${artist.name}` : `已取消关注 ${artist.name}`);
  } catch (reason) { ui.showError(reason); }
}

onMounted(() => {
  const q = typeof route.query.q === 'string' ? route.query.q : '';
  if (q) void run(q);
  else input.value?.focus();
});
</script>

<template>
  <div class="view">
    <section class="search-head">
      <p class="eyebrow accent">FIND YOUR NEXT SOUND</p><h2 class="h2">搜索音乐与音乐人</h2>
      <form class="search-field" @submit.prevent="run()"><AppIcon name="search" /><input ref="input" v-model="query" type="search" placeholder="输入歌名、音乐人、风格或关键词" aria-label="搜索关键词"><button v-if="query" class="icon-btn tiny" type="button" title="清空" @click="run('')"><AppIcon name="x" size="sm" /></button><kbd>ENTER</kbd></form>
      <div class="hot-search"><span class="mono muted">热门搜索</span><div class="chips"><button v-for="item in hotSearches" :key="item" class="hot-chip" type="button" @click="run(item)">{{ item }}</button></div></div>
    </section>

    <div class="search-body">
      <EmptyState v-if="loading || error" :loading="loading" :error="error" title="正在搜索真实作品与音乐人…" @retry="run()" />
      <div v-else-if="!searched" class="search-empty"><div class="empty-icon"><AppIcon name="search" size="lg" /></div><b>从一个关键词开始</b><p>搜索结果来自社区公开作品和用户资料。</p></div>
      <EmptyState v-else-if="!result.works.length && !result.artists.length" title="没有找到匹配内容" description="尝试更短的关键词，或切换风格、歌名与音乐人。" icon="search" />
      <template v-else>
        <section v-if="result.artists.length" class="search-group">
          <h3>音乐人 <span>{{ result.artists.length }}</span></h3>
          <div class="search-artist-row">
            <div v-for="artist in result.artists" :key="artist.id" class="search-artist">
              <button class="search-artist-main" type="button" @click="router.push({ name: 'artist', params: { id: artist.id } })"><span class="avatar sm" :class="coverClass(artist.avatar, artist.id)">{{ initial(artist.name) }}</span><span><b>{{ artist.name }}</b><span>{{ artist.bio || (artist.verified ? '已认证音乐人' : 'SonicHub 创作者') }}</span></span></button>
              <button class="text-btn accent" type="button" @click="toggleFollow(artist)">{{ artist.following ? '已关注' : '+ 关注' }}</button>
            </div>
          </div>
        </section>
        <section v-if="result.works.length" class="search-group">
          <h3>作品 <span>{{ result.works.length }}</span></h3>
          <WorkList :works="result.works" :current-id="player.current?.id" :playing-id="player.playing ? player.current?.id : undefined" @play="player.toggle($event, result.works)" @open="open" @like="like" />
        </section>
      </template>
    </div>
  </div>
</template>
