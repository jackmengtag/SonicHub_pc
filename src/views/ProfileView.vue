<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getMyTags, getMyWorks } from '../api/modules';
import AppIcon from '../components/AppIcon.vue';
import AppModal from '../components/AppModal.vue';
import EmptyState from '../components/EmptyState.vue';
import WorkCard from '../components/WorkCard.vue';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { coverClass, formatCount, initial } from '../utils/format';
import type { MyTagsResult, Work } from '../types/api';

const auth = useAuthStore();
const player = usePlayerStore();
const ui = useUiStore();
const router = useRouter();

const profileLoading = ref(false);
const profileError = ref('');
const worksLoading = ref(false);
const worksError = ref('');
const works = ref<Work[]>([]);
const editOpen = ref(false);
const saving = ref(false);
const saveError = ref('');
const loggingOut = ref(false);
const tagsLoading = ref(false);
const myTags = ref<MyTagsResult | null>(null);
const editForm = reactive({ display_name: '', bio: '' });

const user = computed(() => auth.user);
const musician = computed(() => auth.me?.musician || null);
const recentWorks = computed(() => works.value.slice(0, 6));
const maxAffinity = computed(() => Math.max(0.0001, ...(myTags.value?.affinity || []).map((item) => item.weight)));
function barWidth(weight: number): number {
  return Math.max(6, Math.round(weight / maxAffinity.value * 100));
}
const verified = computed(() => musician.value?.status === 'verified');
const verification = computed(() => {
  const status = musician.value?.status;
  if (status === 'verified') return { label: '已认证', tone: 'mint' };
  if (status === 'pending') return { label: '审核中', tone: 'gold' };
  if (status === 'rejected') return { label: '未通过', tone: 'red' };
  return { label: '未认证', tone: 'gray' };
});

function stat(value: number | undefined) {
  return auth.me ? formatCount(value) : '—';
}

async function loadProfile() {
  profileLoading.value = true;
  profileError.value = '';
  try {
    await auth.loadMe();
  } catch (reason) {
    profileError.value = ui.errorText(reason);
  } finally {
    profileLoading.value = false;
  }
}

async function loadWorks() {
  worksLoading.value = true;
  worksError.value = '';
  try {
    const data = await getMyWorks({ limit: 6 });
    works.value = data.items || [];
  } catch (reason) {
    worksError.value = ui.errorText(reason);
  } finally {
    worksLoading.value = false;
  }
}

async function loadTags() {
  tagsLoading.value = true;
  try {
    myTags.value = await getMyTags();
  } catch {
    myTags.value = null;
  } finally {
    tagsLoading.value = false;
  }
}

function openEditor() {
  editForm.display_name = user.value?.display_name || '';
  editForm.bio = user.value?.bio || '';
  saveError.value = '';
  editOpen.value = true;
}

function closeEditor() {
  if (saving.value) return;
  editOpen.value = false;
  saveError.value = '';
}

async function saveProfile() {
  const displayName = editForm.display_name.trim();
  const nameLength = Array.from(displayName).length;
  if (nameLength < 1 || nameLength > 20) {
    saveError.value = '昵称长度需为 1–20 字';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    await auth.updateMe({ display_name: displayName, bio: editForm.bio.trim() });
    editOpen.value = false;
    ui.showToast('个人资料已更新');
  } catch (reason) {
    saveError.value = ui.errorText(reason);
  } finally {
    saving.value = false;
  }
}

function openWork(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

async function togglePlay(work: Work) {
  try {
    await player.toggle(work, recentWorks.value);
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

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  profileError.value = '';
  try {
    await auth.logout();
    player.reset();
    ui.showToast('已退出登录');
    await router.replace({ name: 'login' });
  } catch (reason) {
    profileError.value = ui.errorText(reason);
    loggingOut.value = false;
  }
}

onMounted(() => {
  void loadProfile();
  void loadWorks();
  void loadTags();
});
</script>

<template>
  <section class="view" aria-labelledby="profile-title">
    <EmptyState v-if="profileLoading && !auth.me" title="正在加载个人资料…" loading />
    <EmptyState
      v-else-if="profileError && !auth.me"
      title="个人资料加载失败"
      :error="profileError"
      @retry="loadProfile"
    />
    <template v-else>
      <header class="view-head">
        <div>
          <p class="eyebrow">CREATOR SPACE</p>
          <h2 id="profile-title" class="h2">我的</h2>
        </div>
      </header>

      <p v-if="profileError" class="inline-status error" role="alert">
        {{ profileError }} <button class="text-btn" type="button" @click="loadProfile">重试</button>
      </p>

      <section class="profile-hero">
        <div class="profile-cover" :class="coverClass(user?.avatar, user?.id)" />
        <div class="profile-main">
          <span class="avatar xl" :class="coverClass(user?.avatar, user?.id)">{{ initial(user?.display_name) }}</span>
          <div class="profile-copy">
            <div class="profile-name">
              <h2>{{ user?.display_name || '音乐人' }}</h2>
              <span class="badge" :class="verified ? 'mint' : 'gray'">{{ verified ? '音乐人' : '创作者' }}</span>
            </div>
            <p class="muted">@{{ user?.id || '—' }}</p>
            <p class="muted">{{ user?.bio || '这位创作者还没有填写个人简介。' }}</p>
            <div class="profile-stats">
              <span><b>{{ stat(auth.me?.counts.works) }}</b>作品</span>
              <span><b>{{ stat(auth.me?.counts.following) }}</b>关注</span>
              <span><b>{{ stat(auth.me?.counts.followers) }}</b>粉丝</span>
              <span><b>{{ stat(auth.me?.counts.friends) }}</b>朋友</span>
              <span><b>{{ auth.me ? formatCount(auth.me.credits.available) : '—' }}</b>积分</span>
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn btn-ghost sm" type="button" @click="openEditor"><AppIcon name="edit" size="sm" />编辑资料</button>
          </div>
        </div>
      </section>

      <div class="profile-grid">
        <section class="panel">
          <div class="panel-head">
            <h3>最近作品</h3>
            <button class="text-btn" type="button" @click="router.push({ name: 'works' })">查看全部</button>
          </div>
          <EmptyState v-if="worksLoading" title="正在加载最近作品…" loading />
          <EmptyState v-else-if="worksError" title="作品加载失败" :error="worksError" @retry="loadWorks" />
          <EmptyState v-else-if="!recentWorks.length" title="还没有作品" description="去「写歌」用一句话生成你的第一首歌。">
            <button class="btn btn-ghost sm mt" type="button" @click="router.push({ name: 'create' })">去写歌</button>
          </EmptyState>
          <div v-else class="work-grid">
            <WorkCard
              v-for="work in recentWorks"
              :key="work.id"
              :work="work"
              :active="player.current?.id === work.id"
              :playing="player.playing && player.current?.id === work.id"
              @open="openWork"
              @play="togglePlay"
              @like="toggleLike"
            />
          </div>
        </section>

        <aside class="panel profile-side">
          <div class="credit-block">
            <p class="eyebrow">CREATIVE CREDITS</p>
            <p class="credit-number mono">{{ auth.me ? auth.me.credits.available : '—' }}</p>
            <p class="muted">可用创作积分</p>
            <div class="credit-hint"><span>冻结中 {{ auth.me ? auth.me.credits.reserved : '—' }}</span></div>
          </div>
          <button class="btn btn-ghost full" type="button" @click="router.push({ name: 'credits' })">
            <AppIcon name="star" size="sm" />进入积分中心
          </button>
          <div class="menu-list">
            <button class="menu-row" type="button" @click="router.push({ name: 'verify' })">
              <AppIcon name="shield" size="sm" /><span>音乐人认证</span>
              <em :class="verification.tone">{{ verification.label }}</em><AppIcon name="chevron-right" size="sm" />
            </button>
            <button class="menu-row" type="button" @click="router.push({ name: 'credits' })">
              <AppIcon name="star" size="sm" /><span>积分中心</span><AppIcon name="chevron-right" size="sm" />
            </button>
            <button class="menu-row" type="button" @click="router.push({ name: 'works' })">
              <AppIcon name="music" size="sm" /><span>我的作品</span>
              <em>{{ stat(auth.me?.counts.works) }}</em><AppIcon name="chevron-right" size="sm" />
            </button>
            <button class="menu-row danger-text" type="button" :disabled="loggingOut" @click="logout">
              <AppIcon name="arrow-right" size="sm" /><span>{{ loggingOut ? '正在退出…' : '退出登录' }}</span>
            </button>
          </div>
        </aside>

        <section class="panel taste-panel">
          <div class="panel-head">
            <h3><AppIcon name="sparkles" size="sm" />我的音乐标签</h3>
            <button class="text-btn" type="button" @click="router.push({ name: 'discover' })">去发现</button>
          </div>
          <div v-if="tagsLoading" class="taste-empty"><span class="spinner" /><span>正在分析你的收听口味…</span></div>
          <p v-else-if="!myTags || (!myTags.affinity.length && !myTags.tags.length)" class="taste-empty muted">
            多听几首歌，我们会根据你的收听、喜欢与收藏逐步构建音乐画像。
          </p>
          <template v-else>
            <div v-if="myTags.affinity.length" class="affinity-list">
              <div v-for="item in myTags.affinity" :key="item.genre" class="affinity-row">
                <span class="affinity-name">{{ item.genre }}</span>
                <span class="affinity-bar"><i :style="{ width: `${barWidth(item.weight)}%` }" /></span>
                <em class="mono">{{ Math.round(item.weight * 100) }}</em>
              </div>
            </div>
            <div v-if="myTags.tags.length" class="taste-tags">
              <span v-for="item in myTags.tags" :key="item.tag_id" class="tag" :title="`${item.category} · ${item.source}`">{{ item.name || item.code }}{{ item.value_label ? ` · ${item.value_label}` : '' }}</span>
            </div>
          </template>
        </section>
      </div>
    </template>
  </section>

  <AppModal :open="editOpen" title="编辑个人资料" @close="closeEditor">
    <form class="verify-form" @submit.prevent="saveProfile">
      <label class="field">
        <span class="field-label">昵称</span>
        <input v-model="editForm.display_name" type="text" maxlength="20" autocomplete="nickname" placeholder="请输入昵称">
      </label>
      <label class="field">
        <span class="field-label">个人简介</span>
        <textarea v-model="editForm.bio" maxlength="200" placeholder="介绍你自己与你的音乐" />
      </label>
      <p v-if="saveError" class="field-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer>
      <button class="btn btn-ghost" type="button" :disabled="saving" @click="closeEditor">取消</button>
      <button class="btn btn-primary" type="button" :disabled="saving" @click="saveProfile">{{ saving ? '保存中…' : '保存资料' }}</button>
    </template>
  </AppModal>
</template>
