<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, formatDuration } from '../utils/format';
import AppIcon from './AppIcon.vue';

const player = usePlayerStore();
const ui = useUiStore();
const router = useRouter();
const audio = ref<HTMLAudioElement | null>(null);

onMounted(() => {
  if (audio.value) player.bindAudio(audio.value);
});

function seek(event: MouseEvent) {
  if (!player.current || !player.duration) return;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  player.seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * player.duration);
}

function seekByKeyboard(event: KeyboardEvent) {
  if (!player.current) return;
  if (event.key === 'ArrowRight') player.seek(player.currentTime + 5);
  else if (event.key === 'ArrowLeft') player.seek(player.currentTime - 5);
}

function changeVolume(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  player.setVolume((event.clientX - rect.left) / rect.width);
}

async function likeCurrent() {
  if (!player.current) return;
  try {
    await player.like(player.current);
  } catch (error) {
    ui.showError(error);
  }
}

function openCurrent() {
  if (player.current) void router.push({ name: 'player', params: { workId: player.current.id } });
}
</script>

<template>
  <footer class="player-bar" aria-label="全局播放器">
    <audio ref="audio" preload="metadata" />
    <div class="pb-track">
      <button class="cover sm pb-cover" :class="coverClass(player.current?.cover, player.current?.id)" type="button" :disabled="!player.current" @click="openCurrent">
        <span v-if="player.current" class="cover-vinyl" />
        <AppIcon v-else name="music" />
      </button>
      <div class="pb-meta">
        <b>{{ player.current?.title || '选择一首歌开始播放' }}</b>
        <span>{{ player.current?.owner_name || 'SonicHub · AI 音乐社区' }}</span>
      </div>
      <button class="icon-btn tiny" :class="{ 'is-on': player.current?.liked }" type="button" title="喜欢" :disabled="!player.current" @click="likeCurrent"><AppIcon name="heart" size="sm" /></button>
    </div>

    <div class="pb-center">
      <div class="pb-controls">
        <button class="icon-btn tiny" :class="{ 'is-on': player.shuffle }" type="button" title="随机播放" @click="player.shuffle = !player.shuffle"><AppIcon name="shuffle" size="sm" /></button>
        <button class="icon-btn" type="button" title="上一首" :disabled="!player.queue.length" @click="player.previous()"><AppIcon name="skip-back" /></button>
        <button class="pb-play" type="button" :title="player.playing ? '暂停' : '播放'" :disabled="!player.current && !player.queue.length" @click="player.toggle()"><AppIcon :name="player.playing ? 'pause' : 'play'" /></button>
        <button class="icon-btn" type="button" title="下一首" :disabled="!player.queue.length" @click="player.next()"><AppIcon name="skip-forward" /></button>
        <button class="icon-btn tiny" :class="{ 'is-on': player.repeat }" type="button" title="单曲循环" @click="player.repeat = !player.repeat"><AppIcon name="repeat" size="sm" /></button>
      </div>
      <div class="pb-progress">
        <span class="mono">{{ formatDuration(player.currentTime) }}</span>
        <div class="progress" role="slider" tabindex="0" aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(player.progress)" @click="seek" @keydown="seekByKeyboard"><i :style="{ width: `${player.progress}%` }" /></div>
        <span class="mono">{{ formatDuration(player.duration || player.current?.duration_seconds) }}</span>
      </div>
    </div>

    <div class="pb-actions">
      <button class="icon-btn tiny" type="button" title="播放详情" :disabled="!player.current" @click="openCurrent"><AppIcon name="list" size="sm" /></button>
      <button class="icon-btn tiny" :class="{ 'is-on': player.muted }" type="button" title="静音" @click="player.toggleMute"><AppIcon name="volume" size="sm" /></button>
      <div class="volume" role="slider" tabindex="0" aria-label="音量" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(player.volume * 100)" @click="changeVolume"><i :style="{ width: `${(player.muted ? 0 : player.volume) * 100}%` }" /></div>
      <span class="mono pb-volume">{{ Math.round((player.muted ? 0 : player.volume) * 100) }}</span>
    </div>
  </footer>
</template>
