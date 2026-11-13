<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createConversation,
  followUser,
  getMusicianProfile,
  getUserProfile,
  unfollowUser,
} from '../api/modules';
import EmptyState from '../components/EmptyState.vue';
import WorkCard from '../components/WorkCard.vue';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, formatCount, initial } from '../utils/format';
import type { MusicianProfile, UserProfile, Work } from '../types/api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const ui = useUiStore();

const profile = ref<MusicianProfile | null>(null);
const userProfile = ref<UserProfile | null>(null);
const loading = ref(false);
const error = ref('');
const actionError = ref('');
const followBusy = ref(false);
const messageBusy = ref(false);
let loadSequence = 0;

const works = computed(() => profile.value?.works || []);
const artistName = computed(() => profile.value?.musician?.stage_name
  || profile.value?.user.stage_name
  || profile.value?.user.name
  || '音乐人');
const artistBio = computed(() => profile.value?.musician?.bio
  || profile.value?.user.bio
  || '这位音乐人还没有填写简介。');
const verified = computed(() => Boolean(
  profile.value?.user.verified || profile.value?.musician?.status === 'verified',
));
const isSelf = computed(() => Boolean(auth.user?.id && auth.user.id === profile.value?.user.id));
const genres = computed(() => profile.value?.musician?.genres || []);

async function loadArtist() {
  const id = typeof route.params.id === 'string' ? route.params.id : '';
  const sequence = ++loadSequence;
  profile.value = null;
  userProfile.value = null;
  actionError.value = '';
  error.value = '';
  if (!id) {
    loading.value = false;
    error.value = '缺少音乐人 ID';
    return;
  }
  loading.value = true;
  try {
    const [artistResult, userResult] = await Promise.allSettled([
      getMusicianProfile(id),
      getUserProfile(id),
    ]);
    if (sequence !== loadSequence) return;
    if (artistResult.status === 'rejected') throw artistResult.reason;
    profile.value = artistResult.value;
    if (userResult.status === 'fulfilled') userProfile.value = userResult.value;
  } catch (reason) {
    if (sequence !== loadSequence) return;
    profile.value = null;
    error.value = ui.errorText(reason);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function openWork(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

async function togglePlay(work: Work) {
  try {
    await player.toggle(work, works.value);
  } catch (reason) {
    ui.showError(reason);
  }
}

async function toggleLike(work: Work) {
  try {
    await player.like(work);
  } catch (reason) {
    ui.showError(reason);
  }
}

async function toggleFollow() {
  const current = profile.value;
  if (!current || isSelf.value || followBusy.value) return;
  followBusy.value = true;
  actionError.value = '';
  try {
    const result = current.user.following
      ? await unfollowUser(current.user.id)
      : await followUser(current.user.id);
    Object.assign(current.user, result);
    if (userProfile.value) Object.assign(userProfile.value.user, result);
    ui.showToast(result.following ? '已关注该音乐人' : '已取消关注');
  } catch (reason) {
    actionError.value = ui.errorText(reason);
    ui.showError(reason);
  } finally {
    followBusy.value = false;
  }
}

async function messageArtist() {
  const current = profile.value;
  if (!current || isSelf.value || messageBusy.value) return;
  messageBusy.value = true;
  actionError.value = '';
  try {
    const conversation = await createConversation({ user_id: current.user.id });
    await router.push({ name: 'messages', query: { conversation: conversation.id } });
  } catch (reason) {
    actionError.value = ui.errorText(reason);
    ui.showError(reason);
  } finally {
    messageBusy.value = false;
  }
}

watch(() => route.params.id, () => {
  void loadArtist();
}, { immediate: true });
</script>

<template>
  <section class="view" aria-labelledby="artist-title">
    <EmptyState v-if="loading" title="正在加载音乐人主页…" loading />
    <EmptyState v-else-if="error" title="音乐人主页加载失败" :error="error" @retry="loadArtist" />
    <template v-else-if="profile">
      <header class="view-head">
        <div>
          <p class="eyebrow">ARTIST PROFILE</p>
          <h2 id="artist-title" class="h2">音乐人主页</h2>
        </div>
      </header>

      <section class="artist-hero">
        <div class="artist-banner" :class="coverClass(profile.user.avatar, profile.user.id)" />
        <div class="artist-head">
          <span class="avatar xl" :class="coverClass(profile.user.avatar, artistName)">{{ initial(artistName) }}</span>
          <div class="artist-copy">
            <div class="profile-name">
              <h2>{{ artistName }}</h2>
              <span class="badge" :class="verified ? 'mint' : 'gray'">{{ verified ? '已认证' : '未认证' }}</span>
            </div>
            <p class="muted">{{ artistBio }}</p>
            <div class="profile-stats">
              <span><b>{{ userProfile ? formatCount(userProfile.counts.works) : works.length }}</b>作品</span>
              <span><b>{{ userProfile ? formatCount(userProfile.counts.followers) : '—' }}</b>粉丝</span>
              <span v-for="genre in genres.slice(0, 4)" :key="genre" class="tag">{{ genre }}</span>
              <span v-if="!genres.length" class="muted">AI 音乐</span>
            </div>
          </div>
          <div class="artist-actions">
            <button
              class="btn sm"
              :class="profile.user.following || isSelf ? 'btn-ghost' : 'btn-primary'"
              type="button"
              :disabled="isSelf || followBusy"
              @click="toggleFollow"
            >{{ isSelf ? '这是你' : followBusy ? '处理中…' : profile.user.following ? (profile.user.friend ? '已互相关注' : '已关注') : '关注' }}</button>
            <button class="btn btn-ghost sm" type="button" :disabled="isSelf || messageBusy" @click="messageArtist">
              {{ messageBusy ? '正在打开…' : '发私信' }}
            </button>
          </div>
        </div>
      </section>
      <p v-if="actionError" class="inline-status error mt" role="alert">{{ actionError }}</p>

      <div class="section-head">
        <h3 class="section-title">公开作品</h3>
        <span class="mono muted">{{ works.length }} 首</span>
      </div>
      <EmptyState v-if="!works.length" title="这个音乐人还没有公开作品" description="关注后，有新作品时可以在关注动态中查看。" />
      <div v-else class="work-grid">
        <WorkCard
          v-for="work in works"
          :key="work.id"
          :work="work"
          :active="player.current?.id === work.id"
          :playing="player.playing && player.current?.id === work.id"
          @open="openWork"
          @play="togglePlay"
          @like="toggleLike"
        />
      </div>
    </template>
  </section>
</template>
