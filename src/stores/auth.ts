import { computed, getCurrentScope, onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import { clearSession, getSession, setSession } from '../api/client';
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  updateMe as updateMeRequest,
} from '../api/modules';
import type { AuthSession, Me, UpdateMeRequest, User } from '../types/api';

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(getSession());
  const me = ref<Me | null>(null);
  const loading = ref(false);
  const initialized = ref(false);

  const user = computed(() => me.value?.user ?? session.value?.user ?? null);
  const isAuthenticated = computed(() => Boolean(session.value?.access_token));

  function syncUser(nextUser: User): void {
    if (me.value) me.value.user = nextUser;
    if (session.value) {
      const next = { ...session.value, user: nextUser };
      session.value = next;
      setSession(next);
    }
  }

  function handleUnauthorized(): void {
    clearSession();
    session.value = null;
    me.value = null;
    initialized.value = true;
  }

  async function login(phone: string, code: string): Promise<AuthSession> {
    loading.value = true;
    try {
      const next = await loginRequest(phone, code);
      session.value = next;
      me.value = null;
      await loadMe();
      return next;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    loading.value = true;
    try {
      await logoutRequest();
    } finally {
      handleUnauthorized();
      loading.value = false;
    }
  }

  async function loadMe(): Promise<Me | null> {
    if (!session.value) {
      me.value = null;
      initialized.value = true;
      return null;
    }
    loading.value = true;
    try {
      const data = await getMe();
      me.value = data;
      syncUser(data.user);
      const current = getSession();
      session.value = current ? { ...current, user: data.user } : null;
      return data;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function updateMe(input: UpdateMeRequest): Promise<User> {
    const nextUser = await updateMeRequest(input);
    syncUser(nextUser);
    return nextUser;
  }

  const unauthorizedListener = () => handleUnauthorized();
  if (typeof window !== 'undefined') {
    window.addEventListener('sh:unauthorized', unauthorizedListener);
    if (getCurrentScope()) {
      onScopeDispose(() => window.removeEventListener('sh:unauthorized', unauthorizedListener));
    }
  }

  return {
    session,
    me,
    user,
    loading,
    initialized,
    isAuthenticated,
    login,
    logout,
    loadMe,
    updateMe,
    handleUnauthorized,
  };
});
