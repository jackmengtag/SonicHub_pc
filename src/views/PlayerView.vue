<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import AppModal from '../components/AppModal.vue';
import EmptyState from '../components/EmptyState.vue';
import { resolveMedia } from '../api/client';
import {
  addWorkComment,
  createShareLink,
  deleteComment,
  followUser,
  getRecommendFeed,
  getUserProfile,
  getWork,
  getWorkComments,
  getWorkLyrics,
  trackShareEvent,
  unfollowUser,
} from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, formatCount, formatDuration, initial, relativeTime } from '../utils/format';
import type { Comment, Work } from '../types/api';

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const auth = useAuthStore();
const ui = useUiStore();
const work = ref<Work | null>(null);
const loading = ref(false);
const error = ref('');
const comments = ref<Comment[]>([]);
const commentsLoading = ref(false);
const commentsError = ref('');
const commentText = ref('');
const sending = ref(false);
const following = ref(false);
const followLoading = ref(false);
const shareOpen = ref(false);
const shareLoading = ref(false);
const shareUrl = ref('');
const shareCode = ref('');
const shareInput = ref<HTMLInputElement | null>(null);
const commentList = ref<HTMLElement | null>(null);
const lyricsText = ref('');
const lyricsLoading = ref(false);
const lyricBox = ref<HTMLElement | null>(null);
const activeLine = ref(-1);
const similar = ref<Work[]>([]);
const similarLoading = ref(false);
const wave = Array.from({ length: 42 }, (_, index) => 10 + (index * 17 % 30));
let sequence = 0;
let similarSequence = 0;

const active = computed(() => Boolean(work.value && player.current?.id === work.value.id));
const isPlaying = computed(() => active.value && player.playing);
const elapsed = computed(() => active.value ? player.currentTime : 0);
const total = computed(() => active.value && player.duration ? player.duration : work.value?.duration_seconds || 0);
const progress = computed(() => total.value ? Math.min(100, elapsed.value / total.value * 100) : 0);
const isSelf = computed(() => Boolean(work.value && auth.user?.id === work.value.owner_id));
const tags = computed(() => {
  if (!work.value) return [];
  const values = (work.value.tags || []).filter(Boolean);
  return values.length ? values : [work.value.genre || '未设置风格'];
});

interface LyricLine { text: string; time: number; }

const LRC_STAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const text = rawLine.replace(LRC_STAMP, '').trim();
    if (!text) continue;
    for (const stamp of rawLine.matchAll(LRC_STAMP)) {
      const fraction = stamp[3] ? Number(`0.${stamp[3].padEnd(3, '0')}`) : 0;
      lines.push({ text, time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

// 无时间戳时按行字数权重把歌词铺满音频时长，保证与演唱大致同步。
function estimateLines(raw: string, lyricsDuration: number): LyricLine[] {
  const rows = raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[\[【(（].{0,24}[\]】)）]$/.test(line));
  if (!rows.length) return [];
  const span = lyricsDuration > 1 ? lyricsDuration : 180;
  const intro = Math.min(10, Math.max(3, span * 0.06));
  const outro = Math.max(2, span * 0.04);
  const usable = Math.max(span - intro - outro, span * 0.6);
  const weights = rows.map((line) => Math.max(4, line.replace(/\s/g, '').length));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = intro;
  return rows.map((text, index) => {
    const time = cursor;
    cursor += usable * weights[index] / weightSum;
    return { text, time };
  });
}

const lyricLines = computed<LyricLine[]>(() => {
  const raw = lyricsText.value.trim();
  if (!raw) return [];
  const timed = parseLrc(raw);
  return timed.length >= 2 ? timed : estimateLines(raw, total.value);
});

async function loadLyrics(id: string) {
  if (!id) {
    lyricsText.value = '';
    return;
  }
  lyricsLoading.value = true;
  try {
    const result = await getWorkLyrics(id);
    lyricsText.value = result.lyrics || '';
  } catch {
    lyricsText.value = '';
  } finally {
    lyricsLoading.value = false;
  }
}

async function loadSimilar(id: string) {
  const current = ++similarSequence;
  similarLoading.value = true;
  try {
    const result = await getRecommendFeed({ scene: 'similar', seed: id, limit: 8 });
    if (current !== similarSequence) return;
    similar.value = (result.items || []).filter((item) => item.id !== id);
  } catch {
    if (current === similarSequence) similar.value = [];
  } finally {
    if (current === similarSequence) similarLoading.value = false;
  }
}

async function playSimilar(item: Work) {
  const list = [item, ...similar.value.filter((candidate) => candidate.id !== item.id)];
  await player.play(item, list);
  if (route.params.workId !== item.id) void router.push({ name: 'player', params: { workId: item.id } });
}

watch(elapsed, (value) => {
  const lines = lyricLines.value;
  if (!lines.length || !active.value) {
    activeLine.value = -1;
    return;
  }
  let next = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (value + 0.12 >= lines[index].time) next = index;
    else break;
  }
  if (next !== activeLine.value) activeLine.value = next;
});

watch(lyricLines, () => { activeLine.value = -1; });

watch(activeLine, async (index) => {
  if (index < 0) return;
  await nextTick();
  const box = lyricBox.value;
  const node = box?.querySelector<HTMLElement>('.lyric-line.is-active');
  if (!box || !node) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.scrollTo({ top: node.offsetTop - box.clientHeight / 2 + node.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
});

async function seekToLine(line: LyricLine) {
  if (!work.value) return;
  if (!active.value) {
    await togglePlayback();
    window.setTimeout(() => player.seek(line.time), 400);
    return;
  }
  player.seek(line.time);
}

async function load(id: string) {
  if (!id) {
    if (player.current) {
      work.value = player.current;
      await Promise.all([loadComments(player.current.id), loadSimilar(player.current.id)]);
      void loadLyrics(player.current.id);
      return;
    }
    error.value = '还没有选择要播放的作品';
    return;
  }
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const data = await getWork(id);
    if (current !== sequence) return;
    work.value = data;
    player.syncWork(data);
    await Promise.all([loadComments(id), loadProfile(data.owner_id), loadLyrics(id), loadSimilar(id)]);
  } catch (reason) {
    if (current === sequence) error.value = ui.errorText(reason);
  } finally {
    if (current === sequence) loading.value = false;
  }
}

async function loadProfile(id: string) {
  if (id === auth.user?.id) return;
  try {
    const profile = await getUserProfile(id);
    following.value = profile.user.following;
  } catch {
    following.value = false;
  }
}

async function loadComments(id: string) {
  commentsLoading.value = true;
  commentsError.value = '';
  try {
    const result = await getWorkComments(id, { limit: 100 });
    comments.value = result.items || [];
  } catch (reason) {
    commentsError.value = ui.errorText(reason);
  } finally {
    commentsLoading.value = false;
  }
}

async function togglePlayback() {
  if (!work.value) return;
  const queue = player.queue.some((item) => item.id === work.value?.id) ? player.queue : [work.value];
  await player.toggle(work.value, queue);
}

function seek(event: MouseEvent) {
  if (!active.value || !total.value) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  player.seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total.value);
}

async function like() {
  if (!work.value) return;
  try { await player.like(work.value); } catch (reason) { ui.showError(reason); }
}

async function collect() {
  if (!work.value) return;
  try {
    await player.collect(work.value);
    ui.showToast(work.value.collected ? '已收藏' : '已取消收藏');
  } catch (reason) { ui.showError(reason); }
}

async function toggleFollow() {
  if (!work.value || isSelf.value) return;
  followLoading.value = true;
  try {
    const result = following.value ? await unfollowUser(work.value.owner_id) : await followUser(work.value.owner_id);
    following.value = result.following;
    ui.showToast(result.following ? (result.friend ? '已互相关注，可以私信了' : '已关注') : '已取消关注');
  } catch (reason) { ui.showError(reason); } finally { followLoading.value = false; }
}

async function sendComment() {
  if (!work.value || sending.value) return;
  const content = commentText.value.trim();
  if (!content) { ui.showToast('评论不能为空'); return; }
  if (content.length > 200) { ui.showToast('评论最多 200 字'); return; }
  sending.value = true;
  try {
    const comment = await addWorkComment(work.value.id, { content });
    comments.value.unshift(comment);
    work.value.comment_count = (work.value.comment_count || 0) + 1;
    player.syncWork(work.value);
    commentText.value = '';
    await nextTick();
    commentList.value?.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (reason) { ui.showError(reason); } finally { sending.value = false; }
}

async function removeComment(comment: Comment) {
  if (!work.value || comment.user_id !== auth.user?.id || !window.confirm('删除这条评论？')) return;
  try {
    await deleteComment(comment.id);
    comments.value = comments.value.filter((item) => item.id !== comment.id);
    work.value.comment_count = Math.max(0, (work.value.comment_count || 0) - 1);
    player.syncWork(work.value);
  } catch (reason) { ui.showError(reason); }
}

async function openShare() {
  if (!work.value) return;
  shareOpen.value = true;
  shareLoading.value = true;
  shareUrl.value = '';
  shareCode.value = '';
  try {
    const result = await createShareLink({ work_id: work.value.id });
    shareCode.value = result.code;
    shareUrl.value = resolveMedia(result.url || `/api/v1/s/${result.code}`);
  } catch (reason) {
    ui.showError(reason);
    shareOpen.value = false;
  } finally { shareLoading.value = false; }
}

async function copyShare() {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
  } catch {
    shareInput.value?.focus();
    shareInput.value?.select();
    document.execCommand('copy');
  }
  if (shareCode.value) void trackShareEvent({ code: shareCode.value, channel: 'clipboard', event_type: 'copy' }).catch(() => undefined);
  ui.showToast('分享链接已复制');
}

watch(() => route.params.workId, (id) => {
  comments.value = [];
  work.value = null;
  lyricsText.value = '';
  activeLine.value = -1;
  similar.value = [];
  similarSequence += 1;
  void load(typeof id === 'string' ? id : '');
}, { immediate: true });
</script>

<template>
  <div class="view">
    <EmptyState v-if="loading || error || !work" :loading="loading" :error="error" title="选择一首作品开始播放" description="你可以从发现、广场或搜索结果进入播放页。" @retry="load(String(route.params.workId || ''))" />
    <div v-else class="player-view">
      <section class="player-main">
        <div class="player-left">
          <div class="player-cover-wrap">
            <div class="player-cover-glow" />
            <div class="cover cover-lg" :class="coverClass(work.cover, work.id)"><span class="cover-vinyl" /></div>
          </div>
          <div class="player-info">
            <p class="eyebrow accent">{{ work.is_ai ? 'AI GENERATED WORK' : 'ORIGINAL WORK' }}</p>
            <h2>{{ work.title || '未命名作品' }}</h2>
            <div class="artist-actions-row">
                              <button class="artist-inline" type="button" @click="router.push({ name: 'artist', params: { id: work.owner_id } })"><span class="avatar sm" :class="coverClass(work.owner_avatar, work.owner_id)">{{ initial(work.owner_name) }}</span><span><b>{{ work.owner_name }}</b><em>{{ work.owner_verified ? '已认证音乐人' : 'SonicHub 创作者' }}</em></span></button>
              <button v-if="!isSelf" class="btn btn-ghost sm" type="button" :disabled="followLoading" @click="toggleFollow">{{ following ? '已关注' : '+ 关注' }}</button>
            </div>
            <div class="player-tags"><span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span></div>
            <div class="player-wave" :class="{ 'is-paused': !isPlaying }" aria-hidden="true"><i v-for="(height, index) in wave" :key="index" :style="{ height: `${height}px`, animationDelay: `${index * -0.04}s` }" /></div>
            <div class="player-progress">
              <div class="progress big" role="slider" tabindex="0" aria-label="播放进度" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" @click="seek"><i :style="{ width: `${progress}%` }" /></div>
              <div class="progress-time mono"><span>{{ formatDuration(elapsed) }}</span><span>{{ formatDuration(total) }}</span></div>
            </div>
            <div class="player-controls">
              <button class="icon-btn" :class="{ 'is-on': player.shuffle }" type="button" title="随机播放" @click="player.shuffle = !player.shuffle"><AppIcon name="shuffle" /></button>
              <button class="icon-btn lg" type="button" title="上一首" :disabled="!player.queue.length" @click="player.previous()"><AppIcon name="skip-back" /></button>
              <button class="play-fab" type="button" :title="isPlaying ? '暂停' : '播放'" @click="togglePlayback"><AppIcon :name="isPlaying ? 'pause' : 'play'" size="lg" /></button>
              <button class="icon-btn lg" type="button" title="下一首" :disabled="!player.queue.length" @click="player.next()"><AppIcon name="skip-forward" /></button>
              <button class="icon-btn" :class="{ 'is-on': player.repeat }" type="button" title="单曲循环" @click="player.repeat = !player.repeat"><AppIcon name="repeat" /></button>
            </div>
            <p v-if="!work.audio_url" class="inline-status error"><AppIcon name="alert" size="sm" />该作品暂无可播放音频</p>
            <div class="player-actions">
              <button class="action-btn" :class="{ 'is-on': work.liked }" type="button" @click="like"><AppIcon name="heart" size="sm" />{{ work.liked ? '已喜欢' : '喜欢' }} · {{ formatCount(work.like_count) }}</button>
              <button class="action-btn" :class="{ 'is-on': work.collected }" type="button" @click="collect"><AppIcon name="star" size="sm" />{{ work.collected ? '已收藏' : '收藏' }}</button>
              <button class="action-btn" type="button" @click="openShare"><AppIcon name="share" size="sm" />分享</button>
              <span class="player-plays mono muted">{{ formatCount(work.play_count) }} 次播放</span>
            </div>
          </div>
        </div>
        <section class="panel lyrics-panel" aria-label="歌词">
          <div class="panel-head"><h3><AppIcon name="music" size="sm" />歌词</h3><span class="mono">{{ lyricLines.length ? '随播放同步' : '暂无' }}</span></div>
          <div v-if="lyricsLoading" class="lyrics-loading"><span class="spinner" /><span>正在载入歌词…</span></div>
          <p v-else-if="!lyricLines.length" class="lyrics-empty">该作品暂无歌词</p>
          <div v-else ref="lyricBox" class="lyrics-body">
            <button v-for="(line, index) in lyricLines" :key="`${line.time}-${index}`" class="lyric-line" :class="{ 'is-active': index === activeLine, 'is-past': index < activeLine }" type="button" @click="seekToLine(line)">{{ line.text }}</button>
          </div>
        </section>
        <section class="panel work-description"><div class="panel-head"><h3>作品简介</h3><span class="mono">{{ relativeTime(work.published_at || work.created_at) }}</span></div><p>{{ work.description || '创作者还没有填写作品简介。' }}</p></section>
      </section>

      <section class="panel comments-panel">
        <div class="panel-head"><h3><AppIcon name="message" size="sm" />评论</h3><span class="mono">{{ work.comment_count || comments.length }}</span></div>
        <form class="comment-input" @submit.prevent="sendComment"><input v-model="commentText" maxlength="200" placeholder="说点什么，让创作者听见…" aria-label="发表评论"><button class="icon-btn" type="submit" title="发送评论" :disabled="sending || !commentText.trim()"><AppIcon name="send" size="sm" /></button></form>
        <div ref="commentList" class="comment-list">
          <EmptyState v-if="commentsLoading || commentsError || !comments.length" :loading="commentsLoading" :error="commentsError" title="还没有评论" description="成为第一个与创作者交流的人。" icon="message" @retry="loadComments(work.id)" />
          <article v-for="comment in comments" v-else :key="comment.id" class="comment-row">
            <span class="avatar sm" :class="coverClass(comment.avatar, comment.user_id)">{{ initial(comment.name) }}</span>
            <div class="comment-main"><div class="comment-head"><b>{{ comment.name || '听众' }}</b><span class="mono">{{ relativeTime(comment.created_at) }}</span></div><p>{{ comment.content }}</p></div>
            <button v-if="comment.user_id === auth.user?.id" class="icon-btn tiny" type="button" title="删除评论" @click="removeComment(comment)"><AppIcon name="trash" size="sm" /></button>
          </article>
        </div>
      </section>

      <section v-if="similar.length || similarLoading" class="panel similar-panel">
        <div class="panel-head"><h3><AppIcon name="sparkles" size="sm" />相似推荐</h3><span class="mono">{{ similarLoading ? 'LOADING' : 'FOR YOU' }}</span></div>
        <div v-if="similarLoading" class="lyrics-loading"><span class="spinner" /><span>正在挑选相似作品…</span></div>
        <div v-else class="similar-list">
          <button v-for="item in similar" :key="item.id" class="similar-row" type="button" @click="playSimilar(item)">
            <span class="cover cover-sm" :class="coverClass(item.cover, item.id)"><span class="cover-vinyl sm" /></span>
            <span class="similar-main">
              <b>{{ item.title || '未命名作品' }}</b>
              <em>{{ item.owner_name || '未知音乐人' }}<template v-if="item.reason"> · {{ item.reason }}</template></em>
            </span>
            <span class="icon-btn tiny"><AppIcon :name="player.current?.id === item.id && player.playing ? 'pause' : 'play'" size="sm" /></span>
          </button>
        </div>
      </section>
    </div>

    <AppModal :open="shareOpen" title="分享作品" @close="shareOpen = false">
      <div v-if="shareLoading" class="loading-box"><span class="spinner" /><span>正在创建分享链接…</span></div>
      <div v-else class="share-dialog"><p class="muted">复制真实分享地址，公开作品可通过该地址访问。</p><div class="share-url"><input ref="shareInput" :value="shareUrl" readonly aria-label="分享地址"><button class="btn btn-primary sm" type="button" @click="copyShare">复制链接</button></div><p v-if="work" class="share-work"><b>{{ work.title }}</b><span>{{ work.owner_name }}</span></p></div>
    </AppModal>
  </div>
</template>
