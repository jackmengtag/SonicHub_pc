<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import WorkList from '../components/WorkList.vue';
import {
  followUser,
  getFollowingFeed,
  getGenres,
  getMyFollowing,
  getPopularTags,
  getRecommendFeed,
  listWorks,
  submitRecommendationFeedback,
  trackRecommendEvents,
  unfollowUser,
} from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, initial } from '../utils/format';
import type { RecommendEventInput, Work, WorkTagCount } from '../types/api';

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
const feed = ref<'recommend' | 'fresh' | 'following'>('recommend');
const works = ref<Work[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const hasMore = ref(false);
const offset = ref(0);
const policy = ref('');
const followingIds = ref(new Set<string>());
const genres = ref<string[]>([]);
const popularTags = ref<WorkTagCount[]>([]);
const genre = ref('');
const tag = ref('');
const listEl = ref<HTMLElement | null>(null);
const wave = [18, 32, 24, 42, 30, 48, 22, 38, 28, 44, 20, 34];

const scene = computed(() => {
  if (feed.value === 'following') return 'following';
  if (tag.value) return `tag:${tag.value}`;
  return feed.value === 'fresh' ? 'fresh' : 'home';
});
const emptyTitle = computed(() => {
  if (feed.value === 'following') return '关注动态还没有作品';
  if (tag.value) return `标签 #${tag.value} 下还没有作品`;
  if (feed.value === 'fresh') return '暂时没有新作品';
  return '暂时没有推荐作品';
});
const emptyDescription = computed(() => {
  if (feed.value === 'following') return '关注音乐人后，他们发布的新作品会出现在这里。';
  if (tag.value) return '换一个标签试试，或去广场浏览社区作品。';
  return '稍后再来看看，或去广场浏览社区作品。';
});

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
    seenImpressions.clear();
  } else {
    loadingMore.value = true;
  }
  try {
    const nextOffset = reset ? 0 : offset.value;
    let items: Work[] = [];
    if (feed.value === 'following') {
      const result = await getFollowingFeed({ limit: 20, offset: nextOffset });
      items = result.items || [];
      hasMore.value = result.has_more;
      policy.value = '';
    } else if (tag.value) {
      const result = await listWorks({ tag: tag.value, sort: 'hot', limit: 20, offset: nextOffset });
      items = result.items || [];
      hasMore.value = items.length === 20;
      policy.value = 'TAG';
    } else {
      const result = await getRecommendFeed({
        limit: 20,
        offset: nextOffset,
        scene: feed.value === 'fresh' ? 'fresh' : 'home',
        genre: genre.value || undefined,
      });
      items = result.items || [];
      hasMore.value = result.has_more;
      policy.value = String(result.policy_version || '');
    }
    works.value = reset ? items : [...works.value, ...items.filter((item) => !works.value.some((work) => work.id === item.id))];
    offset.value = nextOffset + items.length;
    await nextTick();
    observeImpressions();
  } catch (reason) {
    error.value = ui.errorText(reason);
    if (!reset) ui.showError(reason);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadFilters() {
  try {
    const [genreList, tags] = await Promise.all([getGenres(), getPopularTags(12)]);
    genres.value = genreList.slice(0, 10);
    popularTags.value = tags;
  } catch {
    genres.value = [];
    popularTags.value = [];
  }
}

/* ---------- 曝光埋点（离屏不计，单次会话每作品只报一次） ---------- */
const seenImpressions = new Set<string>();
const pendingEvents: RecommendEventInput[] = [];
let flushTimer: number | null = null;
let observer: IntersectionObserver | null = null;

function eventId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `ev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function flushEvents() {
  flushTimer = null;
  if (!pendingEvents.length) return;
  const batch = pendingEvents.splice(0, pendingEvents.length);
  void trackRecommendEvents(batch).catch(() => undefined);
}

function observeImpressions() {
  if (!listEl.value || typeof IntersectionObserver === 'undefined') return;
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const workId = (entry.target as HTMLElement).dataset.workId;
      if (!workId || seenImpressions.has(workId)) continue;
      seenImpressions.add(workId);
      const position = works.value.findIndex((work) => work.id === workId);
      pendingEvents.push({
        event_id: eventId(),
        event_type: 'item.impression',
        work_id: workId,
        scene: scene.value,
        occurred_at: new Date().toISOString(),
        payload: { position, policy_version: policy.value },
      });
      if (flushTimer === null) flushTimer = window.setTimeout(flushEvents, 1200);
    }
  }, { threshold: 0.6 });
  listEl.value.querySelectorAll<HTMLElement>('[data-work-id]').forEach((row) => observer?.observe(row));
}

function pickGenre(next: string) {
  genre.value = genre.value === next ? '' : next;
  tag.value = '';
}
function pickTag(next: string) {
  tag.value = tag.value === next ? '' : next;
  genre.value = '';
}
function resetFilters() {
  genre.value = '';
  tag.value = '';
}

async function dislike(work: Work) {
  works.value = works.value.filter((item) => item.id !== work.id);
  try {
    await submitRecommendationFeedback({ target_type: 'work', target_id: work.id, action: 'dislike' });
    ui.showToast('已记录，将减少类似推荐');
  } catch (reason) {
    ui.showError(reason);
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

watch([feed, genre, tag], () => void load(true));
onMounted(() => {
  void load(true);
  void loadFilters();
  void loadFollowing();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushEvents();
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
        <button class="seg" :class="{ 'is-active': feed === 'recommend' && !tag }" type="button" @click="feed = 'recommend'; resetFilters()">为你推荐</button>
        <button class="seg" :class="{ 'is-active': feed === 'fresh' && !tag }" type="button" @click="feed = 'fresh'; resetFilters()">新作探索</button>
        <button class="seg" :class="{ 'is-active': feed === 'following' }" type="button" @click="feed = 'following'; resetFilters()">关注动态</button>
      </div>
      <div class="section-tools"><span v-if="policy" class="mono muted">POLICY {{ policy }}</span><button class="icon-btn tiny" type="button" title="换一批" :disabled="loading" @click="load(true)"><AppIcon name="repeat" size="sm" /></button></div>
    </div>

    <div v-if="feed !== 'following'" class="filter-bar discover-filter">
      <div class="chips">
        <button class="chip" :class="{ 'is-active': !genre && !tag }" type="button" @click="resetFilters">全部</button>
        <button v-for="item in genres" :key="item" class="chip" :class="{ 'is-active': genre === item }" type="button" @click="pickGenre(item)">{{ item }}</button>
      </div>
      <div v-if="popularTags.length" class="chips discover-tag-chips">
        <button v-for="item in popularTags" :key="item.tag" class="chip tag-chip" :class="{ 'is-active': tag === item.tag }" type="button" @click="pickTag(item.tag)">
          #{{ item.tag }}<em>{{ item.count }}</em>
        </button>
      </div>
    </div>

    <EmptyState v-if="loading || error || !works.length" :loading="loading" :error="error" :title="emptyTitle" :description="emptyDescription" @retry="load(true)" />
    <template v-else>
      <div ref="listEl">
        <WorkList :works="works" :current-id="player.current?.id" :playing-id="player.playing ? player.current?.id : undefined" @play="player.toggle($event, works)" @open="open" @like="like" @dislike="dislike" />
      </div>
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
