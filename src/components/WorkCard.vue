<script setup lang="ts">
import { computed } from 'vue';
import type { Work } from '../types/api';
import { coverClass, formatCount, formatDuration, workStatus } from '../utils/format';
import AppIcon from './AppIcon.vue';

const props = withDefaults(defineProps<{
  work: Work;
  playing?: boolean;
  active?: boolean;
}>(), {
  playing: false,
  active: false,
});

const emit = defineEmits<{
  play: [work: Work];
  open: [work: Work];
  like: [work: Work];
}>();

const hasAudio = computed(() => Boolean(props.work.audio_url));
const isPlaying = computed(() => props.playing && hasAudio.value);
const status = computed(() => workStatus(props.work.status));
const tags = computed(() => {
  const values = (props.work.tags || []).filter(Boolean);
  if (values.length) return values.slice(0, 3);
  return [props.work.genre || '未设置风格'];
});

function requestPlay() {
  if (hasAudio.value) emit('play', props.work);
}
</script>

<template>
  <article
    class="work-card"
    :class="{ 'is-playing': active }"
    tabindex="0"
    @click="emit('open', work)"
    @keydown.enter.self="emit('open', work)"
  >
    <div class="cover" :class="coverClass(work.cover, work.id)">
      <span class="cover-vinyl" />
      <button
        class="play-float"
        type="button"
        :disabled="!hasAudio"
        :aria-label="hasAudio ? (isPlaying ? '暂停' : '播放') : '暂无音频'"
        :title="hasAudio ? (isPlaying ? '暂停' : '播放') : '暂无音频'"
        @click.stop="requestPlay"
      >
        <AppIcon :name="isPlaying ? 'pause' : 'play'" />
      </button>
    </div>
    <div class="work-card-body">
      <div class="work-row-title">
        <b>{{ work.title || '未命名作品' }}</b>
        <span v-if="work.is_ai" class="ai-tag">AI</span>
        <span class="badge" :class="status.tone">{{ status.label }}</span>
      </div>
      <p class="song-sub">
        <button class="text-btn" type="button" @click.stop="emit('open', work)">
          {{ work.owner_name || '未知音乐人' }}
        </button>
        <span v-if="work.owner_verified" class="v-dot" title="已认证">✓</span>
      </p>
      <div class="work-card-foot">
        <div class="tags">
          <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <div class="song-stats">
          <span><AppIcon name="music" size="sm" />{{ formatCount(work.play_count) }}</span>
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
          <span class="duration">{{ formatDuration(work.duration_seconds) }}</span>
        </div>
      </div>
    </div>
  </article>
</template>
