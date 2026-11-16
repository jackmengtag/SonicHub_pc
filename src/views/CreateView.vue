<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { resolveMedia } from '../api/client';
import { getGeneration, getWork, mobileLyrics, mobileMusic } from '../api/modules';
import { useUiStore } from '../stores/ui';
import type { Generation, Work } from '../types/api';

const ui = useUiStore();
const router = useRouter();

const GENRE_OPTIONS = [
  { label: '流行', value: 'pop' },
  { label: '民谣', value: 'folk' },
  { label: '国风', value: 'guofeng' },
  { label: '摇滚', value: 'rock' },
  { label: '电子', value: 'electronic' },
  { label: '爵士', value: 'jazz' },
  { label: 'R&B', value: 'r_and_b' },
  { label: '影视配乐', value: 'cinematic' },
];
const MOOD_OPTIONS = [
  { label: '浪漫', value: 'romantic' },
  { label: '伤感', value: 'sad' },
  { label: '愉快', value: 'happy' },
  { label: '宁静', value: 'peaceful' },
  { label: '治愈', value: 'healing' },
  { label: '史诗', value: 'epic' },
  { label: '忧郁', value: 'melancholy' },
];
const VOCAL_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '女声', value: 'female' },
  { label: '男声', value: 'male' },
];
const DURATION_OPTIONS = [
  { label: '15 秒', value: 15 },
  { label: '30 秒', value: 30 },
  { label: '60 秒', value: 60 },
  { label: '1.5 分钟', value: 90 },
  { label: '2 分钟', value: 120 },
  { label: '3 分钟', value: 180 },
  { label: '5 分钟', value: 300 },
];

const STAGE_LABELS: Record<string, string> = {
  queued: '已排队，等待生成…',
  composing: '正在编曲…',
  rendering: '正在渲染音频…',
  mixing: '正在混音…',
  succeeded: '生成完成',
};

const title = ref('');
const lyrics = ref('');
const genre = ref('pop');
const mood = ref('peaceful');
const vocal = ref('auto');
const bpm = ref(96);
const duration = ref(30);

const writingLyrics = ref(false);
const generating = ref(false);
const stage = ref('填写歌名后点「AI 生成音乐」');
const progress = ref(0);
const error = ref('');
const work = ref<Work | null>(null);
const creditsSpent = ref(0);
const playing = ref(false);
const audioRef = ref<HTMLAudioElement | null>(null);
const wrapRef = ref<HTMLElement | null>(null);

let pollTimer: number | null = null;
let pollFailures = 0;
let taskId: string | null = null;

const audioUrl = computed(() => (work.value ? resolveMedia(work.value.audio_url) : ''));
const genreLabel = computed(() => labelOf(GENRE_OPTIONS, genre.value));
const moodLabel = computed(() => labelOf(MOOD_OPTIONS, mood.value));
const stageTitle = computed(() => {
  if (generating.value) return '正在生成';
  if (work.value) return '生成完成';
  if (error.value) return '生成失败';
  return '准备就绪';
});

function labelOf(options: Array<{ label: string; value: string }>, value: string): string {
  return options.find((item) => item.value === value)?.label || value;
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function stopAudio() {
  audioRef.value?.pause();
  playing.value = false;
}

function requireTitle(): boolean {
  if (title.value.trim()) return true;
  error.value = '请先填写歌曲名称';
  return false;
}

function stageLabel(gen: Generation): string {
  const value = gen.stage || gen.status;
  return STAGE_LABELS[value] || '生成中…';
}

async function writeLyrics() {
  if (writingLyrics.value || generating.value) return;
  error.value = '';
  if (!requireTitle()) return;
  writingLyrics.value = true;
  try {
    const data = await mobileLyrics({
      theme: title.value.trim(),
      genre: genre.value,
      mood: mood.value,
      bpm: bpm.value,
    });
    lyrics.value = data.lyrics || '';
    if (lyrics.value) {
      ui.showToast('歌词已生成，可直接修改');
    } else {
      error.value = '生成歌词失败：返回为空';
    }
  } catch (err) {
    error.value = `生成歌词失败：${ui.errorText(err)}`;
  } finally {
    writingLyrics.value = false;
  }
}

async function startGenerate() {
  if (generating.value || writingLyrics.value) return;
  error.value = '';
  if (!requireTitle()) return;

  stopPolling();
  stopAudio();
  work.value = null;
  creditsSpent.value = 0;
  progress.value = 0;
  generating.value = true;
  stage.value = '正在提交生成任务…';
  taskId = null;

  try {
    const data = await mobileMusic({
      prompt: title.value.trim(),
      lyrics: lyrics.value.trim(),
      genre: genre.value,
      mood: mood.value,
      duration_seconds: duration.value,
      vocal: vocal.value,
      title: title.value.trim(),
      visibility: 'private',
      auto_publish: false,
    });
    taskId = data.generation_id;
    creditsSpent.value = data.credits || 0;
    pollFailures = 0;
    stage.value = data.credits > 0 ? `已提交（消耗 ${data.credits} 积分），正在排队…` : '已提交，正在排队…';
    pollTimer = window.setTimeout(() => void poll(data.generation_id), 1500);
  } catch (err) {
    generating.value = false;
    stage.value = '生成失败，请重试';
    error.value = `提交失败：${ui.errorText(err)}`;
  }
}

async function poll(id: string) {
  pollTimer = null;
  try {
    const gen = await getGeneration(id);
    if (id !== taskId) return;
    pollFailures = 0;
    progress.value = Math.max(0, Math.min(100, gen.progress || 0));
    stage.value = stageLabel(gen);

    if (gen.status === 'succeeded') {
      generating.value = false;
      progress.value = 100;
      stage.value = '生成完成';
      await loadWork(gen.work_id);
      return;
    }
    if (gen.status === 'failed' || gen.status === 'cancelled') {
      generating.value = false;
      error.value = gen.error || (gen.status === 'cancelled' ? '任务已取消' : '生成失败，请重试');
      return;
    }
    pollTimer = window.setTimeout(() => void poll(id), 2000);
  } catch (err) {
    pollFailures += 1;
    if (pollFailures >= 5) {
      generating.value = false;
      error.value = `查询进度失败：${ui.errorText(err)}`;
      return;
    }
    stage.value = `进度查询失败，正在重试（${pollFailures}/5）…`;
    pollTimer = window.setTimeout(() => void poll(id), 2500);
  }
}

async function loadWork(workId?: string) {
  if (!workId) {
    error.value = '生成完成但没有作品信息';
    return;
  }
  try {
    work.value = await getWork(workId);
    ui.showToast('歌曲已生成，可以试听');
  } catch (err) {
    error.value = `获取作品失败：${ui.errorText(err)}`;
  }
}

function togglePlay() {
  const audio = audioRef.value;
  if (!audio) return;
  if (audio.paused) {
    void audio.play().catch((err: Error) => {
      error.value = `试听失败：${err.message}`;
    });
  } else {
    audio.pause();
  }
}

function goWorks() {
  void router.push({ name: 'works' });
}

function scrollPage(direction: 'up' | 'down') {
  const behavior: ScrollBehavior = 'smooth';
  const inner = wrapRef.value?.closest('.view-scroll');
  if (inner instanceof HTMLElement && inner.scrollHeight > inner.clientHeight + 1) {
    inner.scrollTo({ top: direction === 'up' ? 0 : inner.scrollHeight, behavior });
    return;
  }
  window.scrollTo({ top: direction === 'up' ? 0 : document.documentElement.scrollHeight, behavior });
}

onUnmounted(() => {
  stopPolling();
  stopAudio();
});
</script>

<template>
  <section ref="wrapRef" class="view create-wrap" aria-labelledby="create-title">
    <header class="create-head">
      <div>
        <p class="eyebrow">AI MUSIC STUDIO</p>
        <h2 id="create-title" class="h2">把灵感写成一首歌</h2>
        <p class="view-desc">AI 生成歌词与 AI 生成音乐均由 SonicHub 云端完成，生成后自动保存到「我的作品」。</p>
      </div>
    </header>

    <div class="create-card">
      <div class="create-form-grid">
        <div class="create-col">
          <div class="form-block">
            <div class="form-label-row">
              <label class="field-label" for="create-title-input">歌曲名称</label>
              <span class="mono muted">{{ title.length }} / 60</span>
            </div>
            <input
              id="create-title-input"
              v-model="title"
              type="text"
              maxlength="60"
              placeholder="例如：夏夜的海边"
            />
          </div>

          <div class="form-block">
            <div class="form-label-row">
              <label class="field-label" for="create-lyrics">歌词</label>
              <button class="btn btn-ghost sm" type="button" :disabled="writingLyrics || generating" @click="writeLyrics">
                {{ writingLyrics ? '生成歌词中…' : 'AI 生成歌词' }}
              </button>
            </div>
            <textarea
              id="create-lyrics"
              v-model="lyrics"
              rows="9"
              placeholder="点「AI 生成歌词」由音乐大模型生成，也可以自己写整首歌词…"
            />
            <span class="lyric-hint muted">留空则在生成音乐时自动写词</span>
          </div>
        </div>

        <div class="create-col">
          <div class="form-block">
            <span class="field-label">曲风</span>
            <div class="chips lg">
              <button
                v-for="option in GENRE_OPTIONS"
                :key="option.value"
                class="chip"
                :class="{ 'is-active': genre === option.value }"
                type="button"
                :aria-pressed="genre === option.value"
                @click="genre = option.value"
              >{{ option.label }}</button>
            </div>
          </div>

          <div class="form-block">
            <span class="field-label">情绪</span>
            <div class="chips">
              <button
                v-for="option in MOOD_OPTIONS"
                :key="option.value"
                class="chip"
                :class="{ 'is-active': mood === option.value }"
                type="button"
                :aria-pressed="mood === option.value"
                @click="mood = option.value"
              >{{ option.label }}</button>
            </div>
          </div>

          <div class="form-block">
            <span class="field-label">人声</span>
            <div class="chips">
              <button
                v-for="option in VOCAL_OPTIONS"
                :key="option.value"
                class="chip"
                :class="{ 'is-active': vocal === option.value }"
                type="button"
                :aria-pressed="vocal === option.value"
                @click="vocal = option.value"
              >{{ option.label }}</button>
            </div>
          </div>

          <div class="form-block">
            <span class="field-label">时长</span>
            <div class="chips">
              <button
                v-for="option in DURATION_OPTIONS"
                :key="option.value"
                class="chip"
                :class="{ 'is-active': duration === option.value }"
                type="button"
                :aria-pressed="duration === option.value"
                @click="duration = option.value"
              >{{ option.label }}</button>
            </div>
          </div>

          <div class="form-block">
            <div class="form-label-row">
              <span class="field-label">速度 BPM</span>
              <span class="mono muted">{{ bpm }} BPM</span>
            </div>
            <input v-model.number="bpm" class="bpm-range" type="range" min="60" max="150" step="1" />
          </div>
        </div>
      </div>

      <p v-if="error" class="field-error mt" role="alert">{{ error }}</p>

      <footer class="form-foot">
        <span class="muted">AI 生成歌词与 AI 生成音乐会消耗账号积分，生成过程会自动轮询进度。</span>
        <div class="create-actions">
          <button class="btn btn-primary" type="button" :disabled="generating || writingLyrics" @click="startGenerate">
            {{ generating ? '生成音乐中…' : work ? '再生成一首' : 'AI 生成音乐' }}
          </button>
        </div>
      </footer>

      <section v-if="generating || work" class="gen-stage mt" aria-label="生成进度" aria-live="polite">
        <div class="gen-head">
          <div class="gen-disc" />
          <div>
            <span class="mono muted">SONICHUB CLOUD</span>
            <h3>{{ stageTitle }}</h3>
            <p class="muted">{{ stage }}</p>
          </div>
        </div>
        <div class="progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
          <i :style="{ width: `${progress}%` }" />
        </div>
        <div class="gen-steps">
          <span :class="{ 'is-done': progress > 0 }">任务提交</span>
          <span :class="{ 'is-done': progress > 0 }">模型生成</span>
          <span :class="{ 'is-done': progress >= 100 }">保存作品</span>
        </div>
      </section>

      <section v-if="work" class="gen-stage mt" aria-label="生成结果">
        <div class="gen-head">
          <div>
            <span class="mono muted">GENERATED TRACK</span>
            <h3>{{ work.title || title.trim() || 'AI 作品' }}</h3>
            <p class="muted">
              {{ genreLabel }} / {{ moodLabel }}
              · 时长 {{ work.duration_seconds || duration }} 秒
              · 消耗 {{ creditsSpent }} 积分
            </p>
          </div>
        </div>

        <audio
          ref="audioRef"
          :src="audioUrl"
          preload="metadata"
          hidden
          @play="playing = true"
          @pause="playing = false"
          @ended="playing = false"
        />
        <div class="player-controls">
          <button class="play-fab" type="button" :aria-label="playing ? '暂停试听' : '播放成品'" @click="togglePlay">
            {{ playing ? '❚❚' : '▶' }}
          </button>
        </div>

        <p class="inline-status">
          <span>{{ audioUrl ? '作品已保存到「我的作品」，可直接试听' : '作品没有音频地址，暂时无法试听' }}</span>
          <button class="btn btn-ghost sm" type="button" @click="goWorks">去查看</button>
        </p>

        <div v-if="lyrics.trim()" class="result-lyrics">{{ lyrics }}</div>
      </section>
    </div>

    <div class="scroll-fabs" aria-label="页面滚动">
      <button class="scroll-fab" type="button" aria-label="向上滚动" title="向上滚动" @click="scrollPage('up')">↑</button>
      <button class="scroll-fab" type="button" aria-label="向下滚动" title="向下滚动" @click="scrollPage('down')">↓</button>
    </div>
  </section>
</template>

<style scoped>
.bpm-range { width: 100%; accent-color: var(--accent); }
.create-actions { display: flex; gap: 10px; }

.create-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: 26px 32px;
  align-items: start;
}
.create-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.create-col .form-block { margin: 0; }
.lyric-hint { display: block; margin-top: 8px; font-size: 12px; }

.create-wrap input[type="text"] {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 13px 14px;
  color: var(--text);
  caret-color: var(--accent);
  transition: border-color .18s;
}
.create-wrap input[type="text"]:focus { border-color: rgba(255,122,69,.45); }
.create-wrap input[type="text"]::placeholder { color: var(--text-3); }
#create-title-input { padding: 15px 16px; font-size: 16px; font-family: var(--font-display); letter-spacing: .01em; }
#create-lyrics { color: var(--text); }

.scroll-fabs {
  position: fixed;
  right: 22px;
  bottom: 118px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20;
}
.scroll-fab {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: rgba(16, 22, 23, .92);
  color: var(--text);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: color .18s, border-color .18s, transform .18s;
}
.scroll-fab:hover { color: var(--accent); border-color: var(--accent); transform: translateY(-1px); }

@media (max-width: 1080px) {
  .create-form-grid { grid-template-columns: 1fr; }
  .scroll-fabs { right: 14px; bottom: 96px; }
}
</style>
