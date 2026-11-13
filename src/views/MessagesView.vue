<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  getConversationMessages,
  getConversations,
  getNotifications,
  markConversationRead,
  markNotificationRead,
  markNotificationsRead,
  sendConversationMessage,
} from '../api/modules';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUiStore } from '../stores/ui';
import { clockTime, coverClass, formatDuration, initial, relativeTime } from '../utils/format';
import type { Conversation, Message, Notification, Work } from '../types/api';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const ui = useUiStore();

const activeTab = ref<'notice' | 'chat'>(typeof route.query.conversation === 'string' ? 'chat' : 'notice');
const notifications = ref<Notification[]>([]);
const noticeUnread = ref(0);
const notificationsLoading = ref(false);
const notificationsError = ref('');
const readingNotificationId = ref('');
const conversations = ref<Conversation[]>([]);
const conversationsLoading = ref(false);
const conversationsLoaded = ref(false);
const conversationsError = ref('');
const activeConversationId = ref('');
const loadedConversationId = ref('');
const messages = ref<Message[]>([]);
const chatLoading = ref(false);
const chatError = ref('');
const draft = ref('');
const sending = ref(false);
const readAllLoading = ref(false);
const chatBody = ref<HTMLElement | null>(null);
let chatRequest = 0;

const conversationUnread = computed(() => conversations.value.reduce((total, item) => total + (Number(item.unread) || 0), 0));
const selectedConversation = computed(() => conversations.value.find((item) => item.id === activeConversationId.value) || null);
const sharedWorks = computed(() => {
  const works = new Map<string, Work>();
  for (const message of messages.value) {
    if (message.work) works.set(message.work.id, message.work);
  }
  return [...works.values()];
});

function routeConversationId() {
  return typeof route.query.conversation === 'string' ? route.query.conversation : '';
}

function notificationIcon(notification: Notification) {
  if (notification.type === 'interaction') return 'message';
  if (notification.type === 'credit') return 'star';
  if (notification.type === 'musician') return 'shield';
  if (notification.type === 'generation') return 'sparkles';
  return 'bell';
}

function isSelf(message: Message) {
  return message.sender_id === auth.user?.id;
}

async function loadNotifications() {
  if (notificationsLoading.value) return;
  notificationsLoading.value = true;
  notificationsError.value = '';
  try {
    const result = await getNotifications({ limit: 40 });
    notifications.value = result.items || [];
    noticeUnread.value = Number(result.unread) || 0;
    if (auth.me) auth.me.unread_notifications = noticeUnread.value;
  } catch (reason) {
    notificationsError.value = ui.errorText(reason);
  } finally {
    notificationsLoading.value = false;
  }
}

async function openNotification(notification: Notification) {
  if (readingNotificationId.value) return;
  readingNotificationId.value = notification.id;
  try {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
      notification.read_at = new Date().toISOString();
      noticeUnread.value = Math.max(0, noticeUnread.value - 1);
      if (auth.me) auth.me.unread_notifications = noticeUnread.value;
    }
  } catch (reason) {
    ui.showError(reason);
    readingNotificationId.value = '';
    return;
  }
  readingNotificationId.value = '';

  if (notification.target_type === 'work' && notification.target_id) {
    await router.push({ name: 'player', params: { workId: notification.target_id } });
  } else if (['user', 'musician'].includes(notification.target_type) && notification.target_id) {
    await router.push({ name: 'artist', params: { id: notification.target_id } });
  } else if (notification.target_type === 'generation') {
    await router.push({ name: 'works' });
  } else if (notification.target_type === 'credit') {
    await router.push({ name: 'credits' });
  } else if (notification.target_type === 'application' || notification.type === 'musician') {
    await router.push({ name: 'verify' });
  }
}

async function readAllNotifications() {
  if (!noticeUnread.value || readAllLoading.value) return;
  readAllLoading.value = true;
  try {
    await markNotificationsRead({});
    await loadNotifications();
    ui.showToast('通知已全部标记为已读');
  } catch (reason) {
    ui.showError(reason);
  } finally {
    readAllLoading.value = false;
  }
}

async function scrollToBottom() {
  await nextTick();
  if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight;
}

async function openConversation(id: string, syncRoute = true) {
  const conversation = conversations.value.find((item) => item.id === id);
  if (!conversation) return;
  activeTab.value = 'chat';
  if (syncRoute && routeConversationId() !== id) {
    void router.replace({ query: { ...route.query, conversation: id } });
  }
  if (activeConversationId.value === id && (chatLoading.value || (loadedConversationId.value === id && !chatError.value))) return;

  if (activeConversationId.value !== id) draft.value = '';
  activeConversationId.value = id;
  const requestId = ++chatRequest;
  messages.value = [];
  chatLoading.value = true;
  chatError.value = '';
  try {
    const [result] = await Promise.all([
      getConversationMessages(id, { limit: 50 }),
      markConversationRead(id),
    ]);
    const current = conversations.value.find((item) => item.id === id);
    if (current) current.unread = 0;
    if (requestId !== chatRequest || activeConversationId.value !== id) return;
    messages.value = result.items || [];
    loadedConversationId.value = id;
    chatLoading.value = false;
    await scrollToBottom();
  } catch (reason) {
    if (requestId !== chatRequest || activeConversationId.value !== id) return;
    chatError.value = ui.errorText(reason);
  } finally {
    if (requestId === chatRequest) chatLoading.value = false;
  }
}

async function loadConversations(restoreSelection = true) {
  if (conversationsLoading.value) return;
  conversationsLoading.value = true;
  conversationsError.value = '';
  try {
    const result = await getConversations();
    conversations.value = result.items || [];
    conversationsLoaded.value = true;
    if (!restoreSelection) return;
    const id = routeConversationId();
    if (id && conversations.value.some((item) => item.id === id)) {
      activeTab.value = 'chat';
      await openConversation(id, false);
    }
  } catch (reason) {
    conversationsError.value = ui.errorText(reason);
  } finally {
    conversationsLoading.value = false;
  }
}

function switchTab(tab: 'notice' | 'chat') {
  activeTab.value = tab;
}

async function sendMessage() {
  const id = activeConversationId.value;
  const text = draft.value.trim();
  if (!id || !text || sending.value || chatLoading.value) return;
  sending.value = true;
  try {
    const message = await sendConversationMessage(id, { type: 'text', text });
    draft.value = '';
    if (activeConversationId.value === id) {
      messages.value.push(message);
      loadedConversationId.value = id;
      await scrollToBottom();
    }
    const conversation = conversations.value.find((item) => item.id === id);
    if (conversation) {
      conversation.last_message = message.text;
      conversation.updated_at = message.created_at;
    }
    void loadConversations(false);
  } catch (reason) {
    ui.showError(reason);
  } finally {
    sending.value = false;
  }
}

async function readAllConversations() {
  if (!conversationUnread.value || readAllLoading.value) return;
  readAllLoading.value = true;
  try {
    await Promise.all(conversations.value.filter((item) => item.unread).map((item) => markConversationRead(item.id)));
    await loadConversations(false);
    ui.showToast('会话已全部标记为已读');
  } catch (reason) {
    ui.showError(reason);
  } finally {
    readAllLoading.value = false;
  }
}

function readAll() {
  if (activeTab.value === 'notice') void readAllNotifications();
  else void readAllConversations();
}

function openWork(work: Work) {
  void router.push({ name: 'player', params: { workId: work.id } });
}

function toggleWork(work: Work) {
  void player.toggle(work, sharedWorks.value);
}

watch(() => route.query.conversation, (value) => {
  const id = typeof value === 'string' ? value : '';
  if (id) {
    activeTab.value = 'chat';
    if (conversationsLoaded.value && conversations.value.some((item) => item.id === id)) void openConversation(id, false);
  } else if (activeConversationId.value) {
    activeConversationId.value = '';
    loadedConversationId.value = '';
    messages.value = [];
    chatRequest += 1;
  }
});

onMounted(() => {
  void loadNotifications();
  void loadConversations();
});
</script>

<template>
  <div class="view messages-view">
    <div class="messages-layout">
      <section class="msg-list-panel" aria-label="消息列表">
        <div class="msg-tabs section-tools">
          <div class="seg-tabs" role="tablist" aria-label="消息类型">
            <button class="seg" :class="{ 'is-active': activeTab === 'notice' }" type="button" role="tab" :aria-selected="activeTab === 'notice'" @click="switchTab('notice')">
              通知 <span v-if="noticeUnread" class="badge red">{{ noticeUnread > 99 ? '99+' : noticeUnread }}</span>
            </button>
            <button class="seg" :class="{ 'is-active': activeTab === 'chat' }" type="button" role="tab" :aria-selected="activeTab === 'chat'" @click="switchTab('chat')">
              私信 <span v-if="conversationUnread" class="badge red">{{ conversationUnread > 99 ? '99+' : conversationUnread }}</span>
            </button>
          </div>
          <button class="text-btn msg-read" type="button" :disabled="readAllLoading || (activeTab === 'notice' ? !noticeUnread : !conversationUnread)" @click="readAll">
            {{ readAllLoading ? '处理中…' : '全部已读' }}
          </button>
        </div>

        <div class="msg-list">
          <template v-if="activeTab === 'notice'">
            <EmptyState
              v-if="notificationsLoading || notificationsError || !notifications.length"
              :loading="notificationsLoading"
              :error="notificationsError"
              :title="notificationsLoading ? '正在加载通知…' : '暂无通知'"
              description="点赞、评论与系统消息会出现在这里。"
              icon="bell"
              @retry="loadNotifications"
            />
            <button
              v-for="notification in notifications"
              v-else
              :key="notification.id"
              class="msg-item"
              :class="{ 'is-unread': !notification.read_at }"
              type="button"
              :disabled="readingNotificationId === notification.id"
              @click="openNotification(notification)"
            >
              <span class="msg-icon"><AppIcon :name="notificationIcon(notification)" /></span>
              <div class="msg-main">
                <b>{{ notification.title || '通知' }}</b>
                <p>{{ notification.body }}</p>
                <span>{{ relativeTime(notification.created_at) }}</span>
              </div>
              <i v-if="!notification.read_at" class="unread-dot" aria-label="未读" />
            </button>
          </template>

          <template v-else>
            <EmptyState
              v-if="conversationsLoading || conversationsError || !conversations.length"
              :loading="conversationsLoading"
              :error="conversationsError"
              :title="conversationsLoading ? '正在加载会话…' : '暂无会话'"
              description="互相关注后即可私信。"
              icon="message"
              @retry="loadConversations()"
            />
            <button
              v-for="conversation in conversations"
              v-else
              :key="conversation.id"
              class="msg-item"
              :class="{ 'is-active': conversation.id === activeConversationId, 'is-unread': conversation.unread > 0 }"
              type="button"
              @click="openConversation(conversation.id)"
            >
              <span class="avatar sm" :class="coverClass(conversation.peer_avatar, conversation.peer_id)">{{ initial(conversation.peer_name) }}</span>
              <div class="msg-main">
                <b>{{ conversation.peer_name || '朋友' }}</b>
                <p>{{ conversation.last_message || '开始聊天' }}</p>
                <span>{{ relativeTime(conversation.updated_at) }}</span>
              </div>
              <i v-if="conversation.pinned" class="unread-dot" title="置顶" />
              <span v-if="conversation.unread" class="badge red">{{ conversation.unread > 99 ? '99+' : conversation.unread }}</span>
            </button>
          </template>
        </div>
      </section>

      <section class="chat-panel" aria-label="私信会话">
        <div v-if="activeTab === 'notice'" class="chat-empty">
          <div class="empty-icon"><AppIcon name="bell" size="lg" /></div>
          <b>{{ noticeUnread ? `${noticeUnread} 条未读通知` : '通知已读完毕' }}</b>
          <p>点击左侧通知可标记已读，并打开对应作品或音乐人主页。</p>
        </div>
        <div v-else-if="!selectedConversation" class="chat-empty">
          <div class="empty-icon"><AppIcon name="message" size="lg" /></div>
          <b>选择一个会话</b>
          <p>从左侧选择朋友，查看消息或开始聊天。</p>
        </div>
        <div v-else class="chat-conversation">
          <header class="chat-head">
            <span class="avatar sm" :class="coverClass(selectedConversation.peer_avatar, selectedConversation.peer_id)">{{ initial(selectedConversation.peer_name) }}</span>
            <div><b>{{ selectedConversation.peer_name || '朋友' }}</b><em>朋友 · 私信</em></div>
            <div class="chat-head-actions">
              <button class="icon-btn tiny" type="button" title="查看音乐人" aria-label="查看音乐人" @click="router.push({ name: 'artist', params: { id: selectedConversation.peer_id } })"><AppIcon name="user" size="sm" /></button>
            </div>
          </header>

          <div ref="chatBody" class="chat-body">
            <EmptyState
              v-if="chatLoading || chatError || !messages.length"
              :loading="chatLoading"
              :error="chatError"
              :title="chatLoading ? '正在加载消息…' : '还没有消息'"
              description="发一条消息开始聊天。"
              icon="message"
              @retry="openConversation(activeConversationId, false)"
            />
            <template v-else>
              <article v-for="message in messages" :key="message.id" class="chat-msg" :class="{ self: isSelf(message) }">
                <div v-if="message.type === 'song' && message.work" class="bubble song-bubble">
                  <button class="cover sm" :class="coverClass(message.work.cover, message.work.id)" type="button" aria-label="打开分享的作品" @click="openWork(message.work)"><span class="cover-vinyl sm" /></button>
                  <div>
                    <button class="text-btn" type="button" @click="openWork(message.work)"><b>{{ message.work.title || '未命名作品' }}</b></button>
                    <span>{{ message.work.owner_name || '未知音乐人' }} · {{ formatDuration(message.work.duration_seconds) }}</span>
                    <button class="text-btn accent" type="button" @click="openWork(message.work)">查看作品</button>
                  </div>
                  <button class="icon-btn tiny" type="button" :disabled="!message.work.audio_url" :aria-label="player.playing && player.current?.id === message.work.id ? '暂停' : '播放'" @click="toggleWork(message.work)">
                    <AppIcon :name="player.playing && player.current?.id === message.work.id ? 'pause' : 'play'" size="sm" />
                  </button>
                </div>
                <div v-else class="bubble">{{ message.text || (message.type === 'song' ? '分享了一个作品' : '') }}</div>
                <span class="bubble-time mono">{{ clockTime(message.created_at) }}</span>
              </article>
            </template>
          </div>

          <form class="chat-input" @submit.prevent="sendMessage">
            <input v-model="draft" type="text" maxlength="1000" placeholder="发消息…" :disabled="sending || chatLoading" aria-label="消息内容">
            <button class="btn btn-primary sm" type="submit" :disabled="sending || chatLoading || !draft.trim()"><AppIcon name="send" size="sm" />{{ sending ? '发送中…' : '发送' }}</button>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>
