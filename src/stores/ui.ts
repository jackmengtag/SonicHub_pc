import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = defineStore('ui', () => {
  const message = ref('');
  const visible = ref(false);
  const toast = computed(() => ({ message: message.value, visible: visible.value }));

  function showToast(text: string) {
    message.value = text;
    visible.value = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { visible.value = false; }, 2800);
  }

  function errorText(error: unknown) {
    const err = error as { message?: string; code?: string };
    const text = err?.message || '请求失败，请稍后重试';
    return err?.code === 'NETWORK_ERROR' ? `${text}，请确认服务已启动` : text;
  }

  function showError(error: unknown) {
    showToast(errorText(error));
  }

  return { message, visible, toast, showToast, showError, errorText };
});
