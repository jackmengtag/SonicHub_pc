import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  collectWork,
  likeWork,
  recordWorkPlay,
  uncollectWork,
  unlikeWork,
} from '../api/modules';
import { resolveMedia } from '../api/client';
import type { Work } from '../types/api';
import { useUiStore } from './ui';

export const usePlayerStore = defineStore('player', () => {
  const ui = useUiStore();
  const current = ref<Work | null>(null);
  const queue = ref<Work[]>([]);
  const playing = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(0.8);
  const muted = ref(false);
  const shuffle = ref(false);
  const repeat = ref(false);
  const error = ref('');

  let audio: HTMLAudioElement | null = null;
  let boundAudio: HTMLAudioElement | null = null;

  const currentIndex = computed(() => current.value
    ? queue.value.findIndex((item) => item.id === current.value?.id)
    : -1);
  const progress = computed(() => duration.value > 0 ? Math.min(100, currentTime.value / duration.value * 100) : 0);

  function bindAudio(element: HTMLAudioElement): void {
    audio = element;
    audio.volume = volume.value;
    audio.muted = muted.value;
    if (boundAudio === element) return;
    boundAudio = element;
    element.addEventListener('timeupdate', () => {
      currentTime.value = element.currentTime || 0;
      if (Number.isFinite(element.duration)) duration.value = element.duration;
    });
    element.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(element.duration)) duration.value = element.duration;
    });
    element.addEventListener('play', () => { playing.value = true; error.value = ''; });
    element.addEventListener('pause', () => { playing.value = false; });
    element.addEventListener('ended', () => {
      playing.value = false;
      if (repeat.value) {
        element.currentTime = 0;
        void element.play().catch(showPlaybackError);
      } else {
        next();
      }
    });
    element.addEventListener('error', () => {
      if (!current.value) return;
      playing.value = false;
      error.value = '音频加载失败，请稍后重试';
      ui.showToast(error.value);
    });
  }

  function showPlaybackError(reason: unknown): void {
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    playing.value = false;
    error.value = reason instanceof DOMException && reason.name === 'NotAllowedError'
      ? '浏览器阻止了播放，请再次点击播放按钮'
      : ui.errorText(reason);
    ui.showToast(error.value || '无法播放该音频');
  }

  function syncWork(work: Work): void {
    for (const item of queue.value) {
      if (item.id === work.id && item !== work) Object.assign(item, work);
    }
    if (current.value?.id === work.id && current.value !== work) Object.assign(current.value, work);
  }

  function setQueue(works: Work[]): void {
    queue.value = works;
  }

  async function play(work: Work, works?: Work[]): Promise<void> {
    if (!work.audio_url) {
      ui.showToast('该作品暂无可播放音频');
      return;
    }
    if (!audio) {
      ui.showToast('播放器尚未就绪，请稍后重试');
      return;
    }
    if (works) setQueue(works);
    if (!queue.value.some((item) => item.id === work.id)) queue.value = [...queue.value, work];

    const changed = current.value?.id !== work.id;
    current.value = work;
    syncWork(work);
    error.value = '';
    if (changed) {
      currentTime.value = 0;
      duration.value = Number(work.duration_seconds) || 0;
      audio.src = resolveMedia(work.audio_url);
      audio.load();
    } else if (!audio.src) {
      audio.src = resolveMedia(work.audio_url);
    }

    try {
      await audio.play();
      void recordWorkPlay(work.id).then(() => {
        work.play_count = (Number(work.play_count) || 0) + 1;
        syncWork(work);
      }).catch(() => undefined);
    } catch (reason) {
      showPlaybackError(reason);
    }
  }

  async function toggle(work?: Work, works?: Work[]): Promise<void> {
    if (work && current.value?.id !== work.id) {
      await play(work, works);
      return;
    }
    if (works) setQueue(works);
    if (!current.value || !audio) {
      const first = work || queue.value[0];
      if (first) await play(first, works);
      else ui.showToast('先选择一首作品');
      return;
    }
    if (!audio.src) {
      await play(current.value);
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch (reason) {
        showPlaybackError(reason);
      }
    } else {
      audio.pause();
    }
  }

  function pause(): void {
    audio?.pause();
  }

  function next(): void {
    if (!queue.value.length) return;
    if (shuffle.value && queue.value.length > 1) {
      let index = currentIndex.value;
      while (index === currentIndex.value) index = Math.floor(Math.random() * queue.value.length);
      void play(queue.value[index]);
      return;
    }
    const nextIndex = currentIndex.value < 0 ? 0 : (currentIndex.value + 1) % queue.value.length;
    void play(queue.value[nextIndex]);
  }

  function previous(): void {
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (!queue.value.length) return;
    const index = currentIndex.value <= 0 ? queue.value.length - 1 : currentIndex.value - 1;
    void play(queue.value[index]);
  }

  function seek(seconds: number): void {
    if (!audio || !Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(seconds, duration.value || seconds));
    currentTime.value = audio.currentTime;
  }

  function setVolume(value: number): void {
    volume.value = Math.max(0, Math.min(1, value));
    muted.value = volume.value === 0;
    if (audio) {
      audio.volume = volume.value;
      audio.muted = muted.value;
    }
  }

  function toggleMute(): void {
    muted.value = !muted.value;
    if (audio) audio.muted = muted.value;
  }

  async function like(work: Work): Promise<void> {
    const result = work.liked ? await unlikeWork(work.id) : await likeWork(work.id);
    Object.assign(work, result);
    syncWork(work);
  }

  async function collect(work: Work): Promise<void> {
    const result = work.collected ? await uncollectWork(work.id) : await collectWork(work.id);
    Object.assign(work, result);
    syncWork(work);
  }

  function reset(): void {
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    current.value = null;
    queue.value = [];
    playing.value = false;
    currentTime.value = 0;
    duration.value = 0;
    error.value = '';
  }

  return {
    current,
    queue,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    error,
    currentIndex,
    progress,
    bindAudio,
    syncWork,
    setQueue,
    play,
    toggle,
    pause,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    like,
    collect,
    reset,
  };
});
