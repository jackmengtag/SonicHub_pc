<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { base, clearSession, request, setBase } from '../api/client';
import { sendSmsCode } from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { useUiStore } from '../stores/ui';

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const phone = ref('13800138000');
const code = ref('');
const apiBase = ref(base());
const agree = ref(true);
const loading = ref(false);
const checking = ref(false);
const sending = ref(false);
const countdown = ref(0);
const connected = ref<boolean | null>(null);
const error = ref('');
let countdownTimer: number | null = null;
const apiHost = computed(() => apiBase.value.replace(/^https?:\/\//, '').replace(/\/+$/, ''));
const waveHeights = [22, 48, 34, 72, 54, 88, 42, 64, 30, 78, 50, 36, 60, 26, 44, 68];

async function checkHealth(notify = false) {
  checking.value = true;
  error.value = '';
  apiBase.value = setBase(apiBase.value);
  try {
    await request('/health', { auth: false });
    connected.value = true;
    if (notify) ui.showToast('API 连接正常');
    return true;
  } catch (err) {
    connected.value = false;
    error.value = ui.errorText(err);
    if (notify) ui.showError(err);
    return false;
  } finally {
    checking.value = false;
  }
}

async function sendCode() {
  error.value = '';
  if (sending.value || countdown.value > 0) return;
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    error.value = '请输入 11 位手机号';
    return;
  }
  const previousBase = base();
  apiBase.value = setBase(apiBase.value);
  if (previousBase !== apiBase.value) clearSession();
  sending.value = true;
  try {
    const data = await sendSmsCode(phone.value.trim());
    if (data.demo && data.demo_code) {
      code.value = data.demo_code;
      ui.showToast(data.message || `演示模式：验证码 ${data.demo_code}`);
    } else {
      code.value = '';
      ui.showToast(data.message || '验证码已发送，请注意查收');
    }
    startCountdown(data.interval_seconds && data.interval_seconds > 0 ? data.interval_seconds : 60);
  } catch (err) {
    error.value = ui.errorText(err);
    ui.showError(err);
  } finally {
    sending.value = false;
  }
}

function startCountdown(seconds: number) {
  stopCountdown();
  countdown.value = seconds;
  countdownTimer = window.setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) stopCountdown();
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdown.value = 0;
}

async function submit() {
  error.value = '';
  if (!/^1\d{10}$/.test(phone.value.trim())) {
    error.value = '请输入 11 位手机号';
    return;
  }
  if (!code.value.trim()) {
    error.value = '请输入验证码';
    return;
  }
  if (!agree.value) {
    error.value = '请先同意用户协议与 AI 生成内容说明';
    return;
  }
  const previousBase = base();
  apiBase.value = setBase(apiBase.value);
  if (previousBase !== apiBase.value) clearSession();
  loading.value = true;
  try {
    await auth.login(phone.value.trim(), code.value.trim());
    ui.showToast('欢迎回来');
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/')
      ? route.query.redirect
      : '/discover';
    await router.replace(redirect);
  } catch (err) {
    error.value = ui.errorText(err);
    connected.value = false;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (route.query.reason === 'expired') error.value = '登录已过期，请重新登录';
  void checkHealth();
});

onUnmounted(stopCountdown);
</script>

<template>
  <main class="login-screen">
    <div class="login-bg" aria-hidden="true">
      <div class="login-orbit orbit-a" /><div class="login-orbit orbit-b" />
      <div class="login-wave"><i v-for="(height, index) in waveHeights" :key="index" :style="{ '--h': `${height}%` }" /></div>
    </div>
    <section class="login-panel" aria-labelledby="login-title">
      <div class="login-brand">
        <div class="brand-mark"><span /><span /><span /><span /></div>
        <div><p class="brand-name">SonicHub</p><p class="brand-sub">AI MUSIC COMMUNITY · 2026</p></div>
      </div>
      <div class="login-copy">
        <p class="eyebrow accent">WELCOME BACK</p>
        <h1 id="login-title">把此刻的心情，<br>写成一首歌。</h1>
        <p class="login-lede">登录后继续收听、创作与分享。未注册的手机号将自动创建账号。</p>
      </div>
      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">手机号</span>
          <div class="phone-row"><span class="prefix">+86</span><input v-model="phone" type="tel" maxlength="11" autocomplete="tel" placeholder="请输入手机号"></div>
        </label>
        <label class="field">
          <span class="field-label">验证码</span>
          <div class="code-row"><input v-model="code" type="tel" maxlength="6" autocomplete="one-time-code" placeholder="请输入验证码"><button class="text-btn accent" type="button" :disabled="sending || countdown > 0" @click="sendCode">{{ sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}</button></div>
        </label>
        <label class="field">
          <span class="field-label">API 服务器</span>
          <div class="code-row"><input v-model="apiBase" type="url" placeholder="http://119.91.65.225:8080" @change="checkHealth()"><button class="text-btn" type="button" :disabled="checking" @click="checkHealth(true)">{{ checking ? '检测中' : '检测' }}</button></div>
        </label>
        <label class="check-row"><input v-model="agree" type="checkbox"><span>我已阅读并同意《用户协议》《隐私政策》与《AI 生成内容说明》</span></label>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        <button class="btn btn-primary full" type="submit" :disabled="loading">{{ loading ? '登录中…' : '进入 SonicHub' }}</button>
        <div class="login-divider"><span>或</span></div>
        <button class="btn btn-ghost full" type="button" :disabled="checking" @click="checkHealth(true)">测试 API 连接</button>
      </form>
      <div class="login-foot">
        <span>{{ connected === null ? 'API 检测中…' : connected ? 'API 已连接' : 'API 未连接' }}</span>
        <span class="status-dot" :class="{ off: connected === false }" /><span class="mono">{{ apiHost }}</span>
      </div>
    </section>
  </main>
</template>
