<script setup lang="ts">
import type { Work } from '../types/api';
import { coverClass, formatCount, formatDuration, relativeTime, workStatus } from '../utils/format';
import AppIcon from './AppIcon.vue';

withDefaults(defineProps<{
  works: Work[];
  currentId?: string;
  playingId?: string;
  mode?: 'feed' | 'library';
}>(), {
  mode: 'feed',
});

const emit = defineEmits<{
  play: [work: Work];
  open: [work: Work];
  like: [work: Work];
  publish: [work: Work];
  visibility: [work: Work, visibility: string];
  delete: [work: Work];
}>();

const visibilityOptions = [
  { value: 'public', label: '公开' },
  { value: 'friends', label: '仅朋友' },
  { value: 'private', label: '私密' },
] as const;

function requestPlay(work: Work) {
  if (work.audio_url) emit('play', work);
}

function isPlaying(work: Work, playingId?: string) {
  return Boolean(work.audio_url) && work.id === playingId;
}

function tagsFor(work: Work) {
  const tags = (work.tags || []).filter(Boolean);
  if (tags.length) return tags;
  return work.genre ? [work.genre] : [];
}

function visibilityText(visibility: string) {
  return visibilityOptions.find((option) => option.value === visibility)?.label || '公开';
}

function workTime(work: Work) {
  return relativeTime(work.published_at || work.created_at);
}

function changeVisibility(work: Work, event: Event) {
  const visibility = (event.target as HTMLSelectElement).value;
  if (visibility !== work.visibility) emit('visibility', work, visibility);
}
</script>

<template>
  <div v-if="mode === 'feed'" class="song-list">
    <article
      v-for="work in works"
      :key="work.id"
      class="song-row"
      :class="{ 'is-playing': work.id === currentId }"
      tabindex="0"
      @click="emit('open', work)"
      @keydown.enter.self="emit('open', work)"
    >
      <div class="cover" :class="coverClass(work.cover, work.id)">
        <span class="cover-vinyl sm" />
      </div>
      <div class="song-main">
        <div class="song-title">
          <span>{{ work.title || '未命名作品' }}</span>
          <span v-if="work.is_ai" class="ai-tag">AI</span>
        </div>
        <div class="song-sub">
          <span>{{ work.owner_name || '未知音乐人' }}</span>
          <span v-if="work.owner_verified" class="v-dot" title="已认证">✓</span>
          <span>·</span>
          <span>{{ work.reason || visibilityText(work.visibility) }}</span>
        </div>
      </div>
      <div class="song-tags">
        <span v-for="tag in tagsFor(work).slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <div class="song-stats">
        <span><AppIcon name="music" size="sm" />{{ formatCount(work.play_count) }}</span>
        <span><AppIcon name="heart" size="sm" />{{ formatCount(work.like_count) }}</span>
      </div>
      <div class="song-stats">
        <button
          class="icon-btn tiny song-like"
          :class="{ 'is-on': work.liked }"
          type="button"
          :aria-label="work.liked ? '取消喜欢' : '喜欢'"
          :title="work.liked ? '取消喜欢' : '喜欢'"
          @click.stop="emit('like', work)"
        >
          <AppIcon name="heart" size="sm" />
        </button>
        <span class="song-dur">{{ formatDuration(work.duration_seconds) }}</span>
        <button
          class="song-play"
          type="button"
          :disabled="!work.audio_url"
          :aria-label="work.audio_url ? (isPlaying(work, playingId) ? '暂停' : '播放') : '暂无音频'"
          :title="work.audio_url ? (isPlaying(work, playingId) ? '暂停' : '播放') : '暂无音频'"
          @click.stop="requestPlay(work)"
        >
          <AppIcon :name="isPlaying(work, playingId) ? 'pause' : 'play'" />
        </button>
      </div>
    </article>
  </div>

  <div v-else class="work-list">
    <article
      v-for="work in works"
      :key="work.id"
      class="work-row"
      :class="{ 'is-playing': work.id === currentId }"
      tabindex="0"
      @click="emit('open', work)"
      @keydown.enter.self="emit('open', work)"
    >
      <div class="cover sm" :class="coverClass(work.cover, work.id)">
        <span class="cover-vinyl sm" />
      </div>
      <div class="work-row-main">
        <div class="work-row-title">
          <b>{{ work.title || '未命名作品' }}</b>
          <span class="badge" :class="workStatus(work.status).tone">{{ workStatus(work.status).label }}</span>
          <span v-if="work.is_ai" class="ai-tag">AI</span>
        </div>
        <p>
          {{ tagsFor(work).join(' / ') || '未设置风格' }} · {{ visibilityText(work.visibility) }}
          <template v-if="workTime(work)"> · {{ workTime(work) }}</template>
        </p>
        <p v-if="work.status === 'rejected' && work.reject_reason" class="reject-reason">
          拒绝原因：{{ work.reject_reason }}
        </p>
      </div>
      <span class="mono muted">{{ formatDuration(work.duration_seconds) }}</span>
      <div class="song-stats">
        <span><AppIcon name="music" size="sm" />{{ formatCount(work.play_count) }}</span>
      </div>
      <div class="work-row-actions">
        <button
          v-if="work.status === 'draft'"
          class="btn btn-ghost sm"
          type="button"
          @click.stop="emit('publish', work)"
        >发布</button>
        <select
          class="btn btn-ghost sm"
          :value="work.visibility"
          aria-label="设置可见性"
          @click.stop
          @change.stop="changeVisibility(work, $event)"
        >
          <option v-for="option in visibilityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button
          class="icon-btn tiny"
          type="button"
          :disabled="!work.audio_url"
          :aria-label="work.audio_url ? (isPlaying(work, playingId) ? '暂停' : '播放') : '暂无音频'"
          :title="work.audio_url ? (isPlaying(work, playingId) ? '暂停' : '播放') : '暂无音频'"
          @click.stop="requestPlay(work)"
        >
          <AppIcon :name="isPlaying(work, playingId) ? 'pause' : 'play'" size="sm" />
        </button>
        <button
          class="icon-btn tiny"
          type="button"
          aria-label="删除作品"
          title="删除作品"
          @click.stop="emit('delete', work)"
        >
          <AppIcon name="trash" size="sm" />
        </button>
      </div>
    </article>
  </div>
</template>
