<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { applyForMusician, getMyMusicianApplication } from '../api/modules';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';
import { relativeTime } from '../utils/format';
import type { Musician } from '../types/api';

const auth = useAuthStore();
const ui = useUiStore();

const application = ref<Musician | null>(null);
const loading = ref(false);
const error = ref('');
const submitting = ref(false);
const formError = ref('');
const form = reactive<{ stage_name: string; bio: string; genres: string[] }>({
  stage_name: '',
  bio: '',
  genres: [],
});

const defaultGenres = ['流行', '电子', 'Lo-fi', '国风', '摇滚', 'R&B', '影视配乐', '爵士'];
const genreOptions = computed(() => Array.from(new Set([...defaultGenres, ...form.genres])));
const status = computed(() => application.value?.status || '');
const editable = computed(() => !application.value || status.value === 'rejected');
const statusView = computed(() => {
  if (!application.value) {
    return {
      label: '未认证',
      tone: 'gray',
      title: '尚未提交认证',
      text: '填写艺名与擅长风格，提交后预计 1–3 个工作日完成审核。',
      icon: 'shield',
    };
  }
  if (status.value === 'verified') {
    return {
      label: '已认证',
      tone: 'mint',
      title: '音乐人认证已通过',
      text: '你的音乐人身份已生效，作品会展示认证标识。',
      icon: 'check',
    };
  }
  if (status.value === 'pending') {
    return {
      label: '审核中',
      tone: 'gold',
      title: '认证申请审核中',
      text: '预计 1–3 个工作日完成审核，结果会通过站内通知告知。',
      icon: 'clock',
    };
  }
  if (status.value === 'rejected') {
    return {
      label: '未通过',
      tone: 'red',
      title: '认证申请未通过',
      text: '请检查并补充申请资料后重新提交。',
      icon: 'alert',
    };
  }
  return {
    label: status.value || '未知状态',
    tone: 'gray',
    title: '认证申请状态',
    text: `当前申请状态为「${status.value || '未知'}」。`,
    icon: 'shield',
  };
});
const submitLabel = computed(() => {
  if (submitting.value) return '提交中…';
  if (status.value === 'pending') return '审核中…';
  if (status.value === 'verified') return '已认证';
  if (status.value === 'rejected') return '重新提交认证';
  return '提交认证申请';
});

function fillForm(data: Musician | null) {
  form.stage_name = data?.stage_name || auth.user?.display_name || '';
  form.bio = data?.bio || auth.user?.bio || '';
  form.genres = (data?.genres || []).slice(0, 3);
}

function isMissingApplication(reason: unknown) {
  const requestError = reason as { status?: number; code?: string; message?: string };
  return requestError.status === 404
    || requestError.code === 'NOT_FOUND'
    || /no rows in result set/i.test(requestError.message || '');
}

async function loadApplication() {
  loading.value = true;
  error.value = '';
  formError.value = '';
  try {
    const data = await getMyMusicianApplication();
    application.value = data;
    fillForm(data);
  } catch (reason) {
    if (isMissingApplication(reason)) {
      application.value = null;
      fillForm(null);
    } else {
      error.value = ui.errorText(reason);
    }
  } finally {
    loading.value = false;
  }
}

function toggleGenre(genre: string) {
  if (!editable.value || submitting.value) return;
  const index = form.genres.indexOf(genre);
  if (index >= 0) {
    form.genres.splice(index, 1);
    return;
  }
  if (form.genres.length >= 3) {
    ui.showToast('最多选择 3 个擅长风格');
    return;
  }
  form.genres.push(genre);
}

async function submitApplication() {
  if (!editable.value || submitting.value) return;
  const stageName = form.stage_name.trim();
  const bio = form.bio.trim();
  const stageNameLength = Array.from(stageName).length;
  if (stageNameLength < 2 || stageNameLength > 20) {
    formError.value = '艺名需为 2–20 个字符';
    return;
  }
  if (!form.genres.length || form.genres.length > 3) {
    formError.value = '请选择 1–3 个擅长风格';
    return;
  }
  if (Array.from(bio).length > 200) {
    formError.value = '简介最多 200 字';
    return;
  }
  submitting.value = true;
  formError.value = '';
  try {
    await applyForMusician({ stage_name: stageName, bio, genres: [...form.genres] });
    ui.showToast('认证申请已提交');
    await loadApplication();
    await auth.loadMe().catch(() => null);
  } catch (reason) {
    formError.value = ui.errorText(reason);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadApplication();
  if (!auth.me) void auth.loadMe().catch(() => null);
});
</script>

<template>
  <section class="view verify-wrap" aria-labelledby="verify-title">
    <header class="view-head">
      <div>
        <p class="eyebrow">CREATOR VERIFICATION</p>
        <h2 id="verify-title" class="h2">音乐人认证</h2>
        <p class="view-desc">认证你的音乐人身份，让听众更容易识别你与原创作品。</p>
      </div>
      <span class="badge" :class="statusView.tone">{{ statusView.label }}</span>
    </header>

    <EmptyState v-if="loading && !application" title="正在读取认证申请…" loading />
    <EmptyState v-else-if="error" title="认证状态读取失败" :error="error" @retry="loadApplication" />
    <section v-else class="panel verify-card">
      <div class="verify-state">
        <div class="verify-icon"><AppIcon :name="statusView.icon" /></div>
        <div>
          <b>{{ statusView.title }}</b>
          <p class="muted">{{ statusView.text }}</p>
          <p v-if="application?.applied_at" class="muted">申请时间：{{ relativeTime(application.applied_at) }}</p>
          <p v-if="application?.verified_at" class="muted">认证时间：{{ relativeTime(application.verified_at) }}</p>
        </div>
      </div>

      <form class="verify-form" @submit.prevent="submitApplication">
        <div class="verify-form">
          <label class="field">
            <span class="field-label">艺名</span>
            <input v-model="form.stage_name" type="text" minlength="2" maxlength="20" :disabled="!editable || submitting" placeholder="用于公开展示的音乐人名称（2–20 字）">
          </label>
          <label class="field">
            <span class="field-label">音乐人简介</span>
            <textarea v-model="form.bio" maxlength="200" :disabled="!editable || submitting" placeholder="介绍你的音乐方向、创作经历与代表作品（最多 200 字）" />
          </label>
          <div class="field">
            <span class="field-label">擅长风格（选择 1–3 个）</span>
            <div class="chips lg">
              <button
                v-for="genre in genreOptions"
                :key="genre"
                class="chip"
                :class="{ 'is-active': form.genres.includes(genre) }"
                type="button"
                :disabled="!editable || submitting"
                :aria-pressed="form.genres.includes(genre)"
                @click="toggleGenre(genre)"
              >{{ genre }}</button>
            </div>
          </div>
        </div>
        <p v-if="formError" class="field-error" role="alert">{{ formError }}</p>
        <div class="form-foot">
          <span class="muted">{{ editable ? '提交前请确认资料真实、完整。' : statusView.text }}</span>
          <button class="btn btn-primary" type="submit" :disabled="!editable || submitting">{{ submitLabel }}</button>
        </div>
      </form>
    </section>
  </section>
</template>
