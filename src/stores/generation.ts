import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  cancelGeneration,
  createGeneration,
  createQuote,
  getGeneration,
  getWork,
  publishWork,
} from '../api/modules';
import type {
  CreateGenerationRequest,
  Generation,
  PublishWorkRequest,
  Quote,
  QuoteRequest,
  Work,
} from '../types/api';
import { useAuthStore } from './auth';
import { useUiStore } from './ui';

export const ACTIVE_GENERATION_KEY = 'sh_active_generation';
export const GENERATION_POLL_INTERVAL = 2000;
export const MAX_GENERATION_POLL_FAILURES = 8;

function storedGenerationId(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ACTIVE_GENERATION_KEY) || '';
  } catch {
    return '';
  }
}

function isActiveStatus(status: string | undefined): boolean {
  return status === 'queued' || status === 'running';
}

export const useGenerationStore = defineStore('generation', () => {
  const ui = useUiStore();
  const auth = useAuthStore();

  const quote = ref<Quote | null>(null);
  const quoteLoading = ref(false);
  const quoteError = ref('');
  const creating = ref(false);
  const createError = ref('');

  const generation = ref<Generation | null>(null);
  const activeId = ref(storedGenerationId());
  const work = ref<Work | null>(null);
  const workLoading = ref(false);
  const workError = ref('');

  const restoring = ref(false);
  const polling = ref(false);
  const pollFailures = ref(0);
  const pollError = ref('');
  const pollStopped = ref(false);
  const cancelling = ref(false);
  const cancelError = ref('');
  const publishing = ref(false);
  const publishError = ref('');

  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollVersion = 0;
  let quoteVersion = 0;
  let workVersion = 0;

  const hasActiveGeneration = computed(() => Boolean(activeId.value));
  const progress = computed(() => Math.max(0, Math.min(100, Number(generation.value?.progress) || 0)));

  function saveActiveId(id: string): void {
    activeId.value = id;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACTIVE_GENERATION_KEY, id);
    } catch {
      // 无法写入本地存储时仍保留当前页面内的任务状态。
    }
  }

  function clearActiveId(id?: string): void {
    if (id && activeId.value !== id) return;
    activeId.value = '';
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACTIVE_GENERATION_KEY);
    } catch {
      // 本地存储不可用时无需阻断生成流程。
    }
  }

  function stopPolling(): void {
    pollVersion += 1;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    polling.value = false;
  }

  function refreshCredits(): void {
    void auth.loadMe().catch(() => undefined);
  }

  function invalidateQuote(): void {
    quoteVersion += 1;
    quote.value = null;
    quoteLoading.value = false;
    quoteError.value = '';
  }

  async function fetchQuote(input: QuoteRequest): Promise<Quote> {
    const version = ++quoteVersion;
    quote.value = null;
    quoteLoading.value = true;
    quoteError.value = '';
    try {
      const next = await createQuote(input);
      if (version === quoteVersion) quote.value = next;
      return next;
    } catch (reason) {
      if (version === quoteVersion) quoteError.value = ui.errorText(reason);
      throw reason;
    } finally {
      if (version === quoteVersion) quoteLoading.value = false;
    }
  }

  async function loadResultWork(id?: string): Promise<Work | null> {
    const workId = id || generation.value?.work_id;
    if (!workId) {
      workError.value = '生成已完成，但后端未返回作品 ID，请重新查询任务状态。';
      return null;
    }
    const version = ++workVersion;
    const generationId = generation.value?.id || '';
    workLoading.value = true;
    workError.value = '';
    try {
      const next = await getWork(workId);
      if (version !== workVersion) return null;
      if (generationId && generation.value?.id !== generationId) return null;
      work.value = next;
      return next;
    } catch (reason) {
      if (version === workVersion) workError.value = ui.errorText(reason);
      return null;
    } finally {
      if (version === workVersion) workLoading.value = false;
    }
  }

  async function settleGeneration(next: Generation): Promise<void> {
    clearActiveId(next.id);
    if (next.status === 'succeeded') {
      await loadResultWork(next.work_id);
    }
    refreshCredits();
  }

  function schedulePoll(id: string, version: number): void {
    pollTimer = setTimeout(() => {
      void poll(id, version);
    }, GENERATION_POLL_INTERVAL);
  }

  async function poll(id: string, version: number): Promise<void> {
    if (version !== pollVersion) return;
    try {
      const next = await getGeneration(id);
      if (version !== pollVersion) return;
      generation.value = next;
      pollFailures.value = 0;
      pollError.value = '';
      pollStopped.value = false;

      if (!isActiveStatus(next.status)) {
        pollTimer = null;
        polling.value = false;
        await settleGeneration(next);
        return;
      }
      schedulePoll(id, version);
    } catch (reason) {
      if (version !== pollVersion) return;
      pollFailures.value += 1;
      const message = ui.errorText(reason);
      pollError.value = `状态查询失败（连续 ${pollFailures.value}/${MAX_GENERATION_POLL_FAILURES} 次）：${message}`;
      if (pollFailures.value >= MAX_GENERATION_POLL_FAILURES) {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
        polling.value = false;
        pollStopped.value = true;
        pollError.value = `${message}。已连续 ${MAX_GENERATION_POLL_FAILURES} 次查询失败，任务可能仍在后台运行，请点击重试继续查询。`;
        return;
      }
      schedulePoll(id, version);
    }
  }

  function startPolling(id = activeId.value): Promise<void> {
    if (!id) return Promise.resolve();
    stopPolling();
    saveActiveId(id);
    const version = pollVersion;
    pollFailures.value = 0;
    pollError.value = '';
    pollStopped.value = false;
    polling.value = true;
    return poll(id, version);
  }

  async function startGeneration(input: CreateGenerationRequest): Promise<Generation> {
    if (activeId.value) throw new Error('已有生成任务正在跟踪，请先完成或取消当前任务。');
    if (creating.value) throw new Error('生成任务正在提交，请勿重复操作。');
    creating.value = true;
    createError.value = '';
    cancelError.value = '';
    workVersion += 1;
    work.value = null;
    workError.value = '';
    generation.value = null;
    try {
      const next = await createGeneration(input);
      generation.value = next;
      if (isActiveStatus(next.status)) {
        saveActiveId(next.id);
        void startPolling(next.id);
      } else {
        await settleGeneration(next);
      }
      refreshCredits();
      return next;
    } catch (reason) {
      createError.value = ui.errorText(reason);
      throw reason;
    } finally {
      creating.value = false;
    }
  }

  async function restoreActiveGeneration(): Promise<void> {
    const id = storedGenerationId() || activeId.value;
    if (!id) return;
    if (polling.value && activeId.value === id) return;
    restoring.value = true;
    try {
      await startPolling(id);
    } finally {
      restoring.value = false;
    }
  }

  async function retryPolling(): Promise<void> {
    if (activeId.value) {
      await startPolling(activeId.value);
      return;
    }
    const current = generation.value;
    if (current?.status !== 'succeeded') return;
    if (current.work_id) {
      await loadResultWork(current.work_id);
      return;
    }

    workLoading.value = true;
    workError.value = '';
    try {
      const next = await getGeneration(current.id);
      generation.value = next;
      await loadResultWork(next.work_id);
    } catch (reason) {
      workError.value = ui.errorText(reason);
    } finally {
      workLoading.value = false;
    }
  }

  async function cancelActiveGeneration(): Promise<Generation> {
    const id = activeId.value || generation.value?.id;
    if (!id) throw new Error('当前没有可取消的生成任务。');
    cancelling.value = true;
    cancelError.value = '';
    try {
      const next = await cancelGeneration(id);
      generation.value = next;
      if (next.status === 'cancelled') {
        stopPolling();
        clearActiveId(next.id);
        refreshCredits();
      }
      return next;
    } catch (reason) {
      cancelError.value = ui.errorText(reason);
      throw reason;
    } finally {
      cancelling.value = false;
    }
  }

  async function publishGeneratedWork(id: string, input: PublishWorkRequest): Promise<Work> {
    publishing.value = true;
    publishError.value = '';
    try {
      const next = await publishWork(id, input);
      work.value = next;
      return next;
    } catch (reason) {
      publishError.value = ui.errorText(reason);
      throw reason;
    } finally {
      publishing.value = false;
    }
  }

  function reset(): void {
    stopPolling();
    clearActiveId();
    invalidateQuote();
    generation.value = null;
    workVersion += 1;
    work.value = null;
    workError.value = '';
    workLoading.value = false;
    createError.value = '';
    pollFailures.value = 0;
    pollError.value = '';
    pollStopped.value = false;
    cancelling.value = false;
    cancelError.value = '';
    publishing.value = false;
    publishError.value = '';
    restoring.value = false;
  }

  if (getCurrentScope()) onScopeDispose(stopPolling);

  return {
    quote,
    quoteLoading,
    quoteError,
    creating,
    createError,
    generation,
    activeId,
    work,
    workLoading,
    workError,
    restoring,
    polling,
    pollFailures,
    pollError,
    pollStopped,
    cancelling,
    cancelError,
    publishing,
    publishError,
    hasActiveGeneration,
    progress,
    invalidateQuote,
    fetchQuote,
    loadResultWork,
    startGeneration,
    startPolling,
    stopPolling,
    restoreActiveGeneration,
    retryPolling,
    cancelActiveGeneration,
    publishGeneratedWork,
    reset,
  };
});
