<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '../components/EmptyState.vue';
import WorkCard from '../components/WorkCard.vue';
import { getGenres, getPlaza } from '../api/modules';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import type { Work } from '../types/api';

// 与音乐大模型支持的 22 种曲风（MuseFlow）保持一致，接口异常时作为兜底。
const fallbackGenres = [
  '流行', '民谣', '校园民谣', '国风', 'R&B', '乡村',
  '摇滚', '朋克', '金属', '蓝调', '放克', '雷鬼',
  '电子', 'Lo-fi', '氛围', '嘻哈',
  '史诗管弦', '影视配乐', '古典', '爵士', '拉丁', '纯音乐',
];
const genres = ref([{ label: '全部', value: '' }]);
const router = useRouter();
const player = usePlayerStore();
const ui = useUiStore();
const genre = ref('');
const sort = ref('new');
const works = ref<Work[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const hasMore = ref(false);
const offset = ref(0);

async function load(reset = true) {
  if (loading.value || loadingMore.value) return;
  if (reset) { loading.value = true; error.value = ''; } else loadingMore.value = true;
  try {
    const nextOffset = reset ? 0 : offset.value;
    const result = await getPlaza({ genre: genre.value || undefined, sort: sort.value, limit: 24, offset: nextOffset });
    const items = result.items || [];
    works.value = reset ? items : [...works.value, ...items.filter((item) => !works.value.some((work) => work.id === item.id))];
    offset.value = nextOffset + items.length;
    hasMore.value = result.has_more;
  } catch (reason) {
    error.value = ui.errorText(reason);
    if (!reset) ui.showError(reason);
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function like(work: Work) {
  try { await player.like(work); } catch (reason) { ui.showError(reason); }
}

async function loadGenres() {
  let list = fallbackGenres;
  try {
    const remote = await getGenres();
    if (remote.length) list = remote;
  } catch {
    // 接口异常时保留兜底分类
  }
  genres.value = [{ label: '全部', value: '' }, ...list.filter(Boolean).map((item) => ({ label: item, value: item }))];
  if (!genres.value.some((item) => item.value === genre.value)) genre.value = '';
}

watch([genre, sort], () => void load(true));
onMounted(() => {
  void loadGenres();
  void load(true);
});
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div><p class="eyebrow accent">COMMUNITY · NEW SOUNDS</p><h2 class="h2">作品广场</h2><p class="view-desc">浏览社区公开发布的 AI 音乐，播放、喜欢并与创作者交流。</p></div>
      <div class="view-head-side">已加载 <b>{{ works.length }}</b> 首作品</div>
    </header>
    <div class="filter-bar">
      <div class="chips"><button v-for="item in genres" :key="item.value" class="chip" :class="{ 'is-active': genre === item.value }" type="button" @click="genre = item.value">{{ item.label }}</button></div>
      <div class="seg-tabs"><button class="seg" :class="{ 'is-active': sort === 'new' }" type="button" @click="sort = 'new'">最新发布</button><button class="seg" :class="{ 'is-active': sort === 'hot' }" type="button" @click="sort = 'hot'">热门作品</button></div>
    </div>
    <EmptyState v-if="loading || error || !works.length" :loading="loading" :error="error" title="这个分类暂时没有公开作品" description="换一个风格或排序方式看看。" @retry="load(true)" />
    <template v-else>
      <div class="work-grid">
        <WorkCard v-for="work in works" :key="work.id" :work="work" :active="player.current?.id === work.id" :playing="player.playing && player.current?.id === work.id" @play="player.toggle($event, works)" @open="router.push({ name: 'player', params: { workId: work.id } })" @like="like" />
      </div>
      <div v-if="hasMore" class="load-more"><button class="btn btn-ghost" type="button" :disabled="loadingMore" @click="load(false)">{{ loadingMore ? '加载中…' : '加载更多作品' }}</button></div>
    </template>
  </div>
</template>
