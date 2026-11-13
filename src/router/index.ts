import { createRouter, createWebHistory } from 'vue-router';
import { getSession } from '../api/client';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true, title: '登录', eyebrow: 'WELCOME' },
    },
    {
      path: '/',
      component: () => import('../layouts/DesktopLayout.vue'),
      children: [
        { path: '', redirect: { name: 'discover' } },
        { path: 'discover', name: 'discover', component: () => import('../views/DiscoverView.vue'), meta: { title: '发现', eyebrow: 'DISCOVER' } },
        { path: 'plaza', name: 'plaza', component: () => import('../views/PlazaView.vue'), meta: { title: '广场', eyebrow: 'PLAZA' } },
        { path: 'search', name: 'search', component: () => import('../views/SearchView.vue'), meta: { title: '搜索', eyebrow: 'SEARCH' } },
        { path: 'create', name: 'create', component: () => import('../views/CreateView.vue'), meta: { title: '写歌', eyebrow: 'SONIC LAB' } },
        { path: 'player/:workId?', name: 'player', component: () => import('../views/PlayerView.vue'), meta: { title: '正在播放', eyebrow: 'NOW PLAYING' } },
        { path: 'works', name: 'works', component: () => import('../views/WorksView.vue'), meta: { title: '我的作品', eyebrow: 'LIBRARY' } },
        { path: 'credits', name: 'credits', component: () => import('../views/CreditsView.vue'), meta: { title: '积分中心', eyebrow: 'CREDITS' } },
        { path: 'messages', name: 'messages', component: () => import('../views/MessagesView.vue'), meta: { title: '消息', eyebrow: 'MESSAGES' } },
        { path: 'profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { title: '我的', eyebrow: 'CREATOR' } },
        { path: 'verify', name: 'verify', component: () => import('../views/VerifyView.vue'), meta: { title: '音乐人认证', eyebrow: 'CREATOR VERIFY' } },
        { path: 'artists/:id', name: 'artist', component: () => import('../views/ArtistView.vue'), meta: { title: '音乐人主页', eyebrow: 'ARTIST' } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: { name: 'discover' } },
  ],
});

router.beforeEach((to) => {
  const authenticated = Boolean(getSession()?.access_token);
  if (!to.meta.public && !authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && authenticated) return { name: 'discover' };
  document.title = `${String(to.meta.title || 'AI 音乐社区')} · SonicHub`;
  return true;
});

export default router;
