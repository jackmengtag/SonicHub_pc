<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  deleteWork,
  getMyWorks,
  publishWork,
  setWorkVisibility,
} from '../api/modules';
import AppModal from '../components/AppModal.vue';
import EmptyState from '../components/EmptyState.vue';
import WorkList from '../components/WorkList.vue';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import type { Visibility, Work } from '../types/api';

const router = useRouter();
const player = usePlayerStore();
const ui = useUiStore();

const works = ref<Work[]>([]);
const loading = ref(false);
const error = ref('');
const filter = ref('all');
const listVersion = ref(0);
const visibilityBusyId = ref('');

const publishingWork = ref<Work | null>(null);
const publishing = ref(false);
const publishError = ref('');
const publishForm = reactive<{
  title: string;
  description: string;
  tags: string;
  visibility: Visibility;
}>({ title: '', description: '', tags: '', visibility: 'public' });

const deletingWork = ref<Work | null>(null);
const deleting = ref(false);
const deleteError = ref('');

const filters = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'pending_review', label: '审核中' },
  { value: 'rejected', label: '未通过' },
  { value: 'draft', label: '草稿' },
];

const filteredWorks = computed(() => filter.value === 'all'
  ? works.value
  : works.value.filter((work) => work.status === filter.value));

const currentId = computed(() => player.current?.id || '');
const playingId = computed(() => player.playing ? player.current?.id || '' : '');

async function loadWorks() {
  loading.value = true;
  error.value = '';
  try {
    const data = await getMyWorks({ limit: 50 });
    works.value = data.items || [];
  } catch (reason) {
    error.value = ui.errorText(reason);
  } finally {
    loading.value = false;
  }
}

function openWork(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

async function togglePlay(work: Work) {
  try {
    await player.toggle(work, filteredWorks.value);
  } catch (reason) {
    ui.showError(reason);
  }
}

function openPublish(work: Work) {
  publishingWork.value = work;
  publishForm.title = work.title || '';
  publishForm.description = work.description || '';
  publishForm.tags = (work.tags || []).join('，');
  publishForm.visibility = (['public', 'friends', 'private'].includes(work.visibility)
    ? work.visibility
    : 'public') as Visibility;
  publishError.value = '';
}

function closePublish() {
  if (publishing.value) return;
  publishingWork.value = null;
  publishError.value = '';
}

async function submitPublish() {
  const work = publishingWork.value;
  if (!work || publishing.value) return;
  const title = publishForm.title.trim();
  if (!title) {
    publishError.value = '作品标题不能为空';
    return;
  }
  const tags = Array.from(new Set(
    publishForm.tags.split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean),
  ));
  publishing.value = true;
  publishError.value = '';
  try {
    const next = await publishWork(work.id, {
      title,
      description: publishForm.description.trim(),
      tags,
      visibility: publishForm.visibility,
    });
    const index = works.value.findIndex((item) => item.id === work.id);
    if (index >= 0) works.value[index] = next;
    player.syncWork(next);
    publishingWork.value = null;
    if (next.status === 'rejected') {
      ui.showToast(`审核未通过：${next.reject_reason || '请调整内容后重试'}`);
    } else {
      ui.showToast(next.status === 'published' ? '作品已发布' : '作品已提交审核');
    }
  } catch (reason) {
    publishError.value = ui.errorText(reason);
  } finally {
    publishing.value = false;
  }
}

async function changeVisibility(work: Work, value: string) {
  if (!['public', 'friends', 'private'].includes(value)) return;
  if (visibilityBusyId.value) {
    listVersion.value += 1;
    return;
  }
  const visibility = value as Visibility;
  const previous = work.visibility;
  visibilityBusyId.value = work.id;
  try {
    const result = await setWorkVisibility(work.id, { visibility });
    work.visibility = result.visibility;
    player.syncWork(work);
    ui.showToast('作品可见范围已更新');
  } catch (reason) {
    work.visibility = previous;
    listVersion.value += 1;
    ui.showError(reason);
  } finally {
    visibilityBusyId.value = '';
  }
}

function requestDelete(work: Work) {
  deletingWork.value = work;
  deleteError.value = '';
}

function closeDelete() {
  if (deleting.value) return;
  deletingWork.value = null;
  deleteError.value = '';
}

async function confirmDelete() {
  const work = deletingWork.value;
  if (!work || deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await deleteWork(work.id);
    works.value = works.value.filter((item) => item.id !== work.id);
    if (player.current?.id === work.id) player.reset();
    deletingWork.value = null;
    ui.showToast('作品已删除');
  } catch (reason) {
    deleteError.value = ui.errorText(reason);
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void loadWorks();
});
</script>

<template>
  <section class="view" aria-labelledby="works-title">
    <header class="view-head">
      <div>
        <p class="eyebrow">MY LIBRARY</p>
        <h2 id="works-title" class="h2">我的作品</h2>
        <p class="view-desc">管理草稿、审核与已发布作品，设置每首作品的可见范围。</p>
      </div>
      <div class="view-head-side"><b>{{ filteredWorks.length }}</b> 首作品</div>
    </header>

    <div class="filter-bar">
      <div class="chips" aria-label="按作品状态筛选">
        <button
          v-for="item in filters"
          :key="item.value"
          class="chip"
          :class="{ 'is-active': filter === item.value }"
          type="button"
          :aria-pressed="filter === item.value"
          @click="filter = item.value"
        >{{ item.label }}</button>
      </div>
      <button class="btn btn-primary sm" type="button" @click="router.push({ name: 'create' })">创作新作品</button>
    </div>

    <EmptyState
      v-if="loading"
      title="正在加载我的作品…"
      loading
    />
    <EmptyState
      v-else-if="error"
      title="作品加载失败"
      :error="error"
      @retry="loadWorks"
    />
    <EmptyState
      v-else-if="!filteredWorks.length"
      :title="filter === 'all' ? '还没有作品' : '这个状态下没有作品'"
      :description="filter === 'all' ? '去「写歌」生成你的第一首 AI 作品。' : '切换筛选条件看看。'"
    >
      <button v-if="filter === 'all'" class="btn btn-ghost sm mt" type="button" @click="router.push({ name: 'create' })">去写歌</button>
    </EmptyState>
    <WorkList
      v-else
      :key="listVersion"
      :works="filteredWorks"
      :current-id="currentId"
      :playing-id="playingId"
      mode="library"
      @open="openWork"
      @play="togglePlay"
      @publish="openPublish"
      @visibility="changeVisibility"
      @delete="requestDelete"
    />
  </section>

  <AppModal
    :open="Boolean(publishingWork)"
    title="发布作品"
    @close="closePublish"
  >
    <form class="verify-form" @submit.prevent="submitPublish">
      <label class="field">
        <span class="field-label">作品标题</span>
        <input v-model="publishForm.title" type="text" maxlength="80" placeholder="请输入作品标题" autofocus>
      </label>
      <label class="field">
        <span class="field-label">作品描述</span>
        <textarea v-model="publishForm.description" maxlength="500" placeholder="介绍创作灵感与作品内容" />
      </label>
      <label class="field">
        <span class="field-label">标签</span>
        <input v-model="publishForm.tags" type="text" placeholder="使用逗号分隔，例如：电子，Lo-fi">
      </label>
      <div class="field">
        <span class="field-label">可见范围</span>
        <div class="chips lg">
          <button
            v-for="option in [{ value: 'public', label: '公开' }, { value: 'friends', label: '仅朋友' }, { value: 'private', label: '私密' }]"
            :key="option.value"
            class="chip"
            :class="{ 'is-active': publishForm.visibility === option.value }"
            type="button"
            @click="publishForm.visibility = option.value as Visibility"
          >{{ option.label }}</button>
        </div>
      </div>
      <p v-if="publishError" class="field-error" role="alert">{{ publishError }}</p>
    </form>
    <template #footer>
      <button class="btn btn-ghost" type="button" :disabled="publishing" @click="closePublish">取消</button>
      <button class="btn btn-primary" type="button" :disabled="publishing" @click="submitPublish">
        {{ publishing ? '发布中…' : '确认发布' }}
      </button>
    </template>
  </AppModal>

  <AppModal
    :open="Boolean(deletingWork)"
    title="删除作品"
    width="440px"
    @close="closeDelete"
  >
    <p class="view-desc">确定删除《{{ deletingWork?.title || '未命名作品' }}》吗？删除后无法恢复。</p>
    <p v-if="deleteError" class="field-error mt" role="alert">{{ deleteError }}</p>
    <template #footer>
      <button class="btn btn-ghost" type="button" :disabled="deleting" @click="closeDelete">取消</button>
      <button class="btn btn-primary" type="button" :disabled="deleting" @click="confirmDelete">
        {{ deleting ? '删除中…' : '确认删除' }}
      </button>
    </template>
  </AppModal>
</template>
