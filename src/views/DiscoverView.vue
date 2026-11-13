<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import WorkList from '../components/WorkList.vue';
import { followUser, getFollowingFeed, getMyFollowing, getRecommendFeed, unfollowUser } from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, initial } from '../utils/format';
import type { Work } from '../types/api';

interface Artist {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  genre: string;
}

const router = useRouter();
const player = usePlayerStore();
const auth = useAuthStore();
const ui = useUiStore();
const feed = ref<'recommend' | 'following'>('recommend');
const works = ref<Work[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const hasMore = ref(false);
const offset = ref(0);
const policy = ref('');
const followingIds = ref(new Set<string>());
const wave = [18, 32, 24, 42, 30, 48, 22, 38, 28, 44, 20, 34];

const featured = computed(() => works.value.find((work) => work.audio_url) || null);
const artists = computed<Artist[]>(() => {
  const map = new Map<string, Artist>();
  for (const work of works.value) {
    if (work.owner_id === auth.user?.id || map.has(work.owner_id)) continue;
    map.set(work.owner_id, {
      id: work.owner_id,
      name: work.owner_name || '未知音乐人',
      avatar: work.owner_avatar,
      verified: work.owner_verified,
      genre: work.genre || work.tags?.[0] || 'AI 音乐',
    });
  }
  return [...map.values()].slice(0, 4);
});

async function load(reset = true) {
  if (loading.value || loadingMore.value) return;
  if (reset) {
    loading.value = true;
    error.value = '';
  } else {
    loadingMore.value = true;
  }
  try {
    const nextOffset = reset ? 0 : offset.value;
    const result = feed.value === 'recommend'
      ? await getRecommendFeed({ limit: 20, offset: nextOffset })
      : await getFollowingFeed({ limit: 20, offset: nextOffset });
    const items = result.items || [];
    works.value = reset ? items : [...works.value, ...items.filter((item) => !works.value.some((work) => work.id === item.id))];
    offset.value = nextOffset + items.length;
    hasMore.value = result.has_more;
    policy.value = 'policy_version' in result ? String(result.policy_version || '') : '';
  } catch (reason) {
    error.value = ui.errorText(reason);
    if (!reset) ui.showError(reason);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadFollowing() {
  try {
    const result = await getMyFollowing();
    followingIds.value = new Set(result.items.map((item) => item.id));
  } catch {
    followingIds.value = new Set();
  }
}

function open(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

async function like(work: Work) {
  try {
    await player.like(work);
  } catch (reason) {
    ui.showError(reason);
  }
}

async function toggleFollow(artist: Artist) {
  try {
    const result = followingIds.value.has(artist.id) ? await unfollowUser(artist.id) : await followUser(artist.id);
    const next = new Set(followingIds.value);
    if (result.following) next.add(artist.id); else next.delete(artist.id);
    followingIds.value = next;
    ui.showToast(result.following ? `已关注 ${artist.name}` : `已取消关注 ${artist.name}`);
  } catch (reason) {
    ui.showError(reason);
  }
}

watch(feed, () => void load(true));
onMounted(() => {
  void load(true);
  void loadFollowing();
});
</script>

<template>
  <div class="view discover-view">
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow accent">CURATED FOR YOU · REAL TIME API</p>
        <h2>{{ featured ? featured.title : '让灵感，成为下一首歌。' }}</h2>
        <p class="hero-lede">{{ featured ? `来自 ${featured.owner_name} 的${featured.genre || 'AI 音乐'}作品。播放、收藏，或沿着这首作品继续发现新的声音。` : '发现社区音乐人发布的真实作品，也可以从一句描述开始，生成属于你自己的音乐。' }}</p>
        <div class="hero-actions">
          <button v-if="featured" class="btn btn-primary" type="button" @click="player.toggle(featured, works)"><AppIcon :name="player.playing && player.current?.id === featured.id ? 'pause' : 'play'" />{{ player.playing && player.current?.id === featured.id ? '暂停播放' : '立即播放' }}</button>
          <button class="btn" :class="featured ? 'btn-ghost' : 'btn-primary'" type="button" @click="router.push({ name: 'create' })"><AppIcon name="sparkles" />开始写歌</button>
          <button class="btn btn-ghost" type="button" @click="router.push({ name: 'plaza' })">浏览广场</button>
        </div>
        <div class="hero-meta"><span>真实音频</span><i /><span>AI 辅助创作</span><i /><span>社区互动</span></div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-disc" :class="featured ? coverClass(featured.cover, featured.id) : 'c1'"><span class="hero-disc-hole" /></div>
        <div class="hero-wave"><i v-for="(height, index) in wave" :key="index" :style="{ height: `${height}px`, animationDelay: `${index * -0.08}s` }" /></div>
        <span class="hero-art-label">SONICHUB · SOUND IN MOTION</span>
      </div>
    </section>

    <div class="section-head">
      <div class="seg-tabs" role="tablist" aria-label="发现信息流">
        <button class="seg" :class="{ 'is-active': feed === 'recommend' }" type="button" @click="feed = 'recommend'">为你推荐</button>
        <button class="seg" :class="{ 'is-active': feed === 'following' }" type="button" @click="feed = 'following'">关注动态</button>
      </div>
      <div class="section-tools"><span v-if="policy" class="mono muted">POLICY {{ policy }}</span><button class="icon-btn tiny" type="button" title="刷新" :disabled="loading" @click="load(true)"><AppIcon name="repeat" size="sm" /></button></div>
    </div>

    <EmptyState v-if="loading || error || !works.length" :loading="loading" :error="error" :title="feed === 'following' ? '关注动态还没有作品' : '暂时没有推荐作品'" :description="feed === 'following' ? '关注音乐人后，他们发布的新作品会出现在这里。' : '稍后再来看看，或去广场浏览社区作品。'" @retry="load(true)" />
    <template v-else>
      <WorkList :works="works" :current-id="player.current?.id" :playing-id="player.playing ? player.current?.id : undefined" @play="player.toggle($event, works)" @open="open" @like="like" />
      <div v-if="hasMore" class="load-more"><button class="btn btn-ghost" type="button" :disabled="loadingMore" @click="load(false)">{{ loadingMore ? '加载中…' : '加载更多' }}</button></div>
    </template>

    <section v-if="artists.length" class="discover-artists">
      <div class="section-head"><h2 class="section-title">来自本页作品的音乐人</h2><span class="eyebrow">CREATORS</span></div>
      <div class="artist-rail">
        <article v-for="artist in artists" :key="artist.id" class="artist-card" @click="router.push({ name: 'artist', params: { id: artist.id } })">
          <span class="avatar" :class="coverClass(artist.avatar, artist.id)">{{ initial(artist.name) }}</span>
          <b>{{ artist.name }}<span v-if="artist.verified" class="v-dot">✓</span></b>
          <p>{{ artist.genre }}</p>
          <button class="artist-follow" :class="{ 'is-on': followingIds.has(artist.id) }" type="button" @click.stop="toggleFollow(artist)">{{ followingIds.has(artist.id) ? '已关注' : '+ 关注' }}</button>
        </article>
      </div>
    </section>
  </div>
</template>
