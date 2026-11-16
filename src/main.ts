import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import '../styles.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

window.addEventListener('sh:unauthorized', () => {
  if (router.currentRoute.value.name === 'login') return;
  void router.push({ name: 'login', query: { reason: 'expired' } });
});

void router.isReady().then(() => app.mount('#app'));
