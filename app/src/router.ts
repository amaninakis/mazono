import { createRouter, createWebHistory } from 'vue-router';
import Extraction from './screens/Extraction.vue';
import Journal from './screens/Journal.vue';
import Oil from './screens/Oil.vue';
import More from './screens/More.vue';
import Settings from './screens/Settings.vue';
import Soon from './screens/Soon.vue';
import Today from './screens/Today.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: Today },
    { path: '/entry/:id', name: 'entry', component: Today },
    { path: '/journal', name: 'journal', component: Journal },
    { path: '/oil', name: 'oil', component: Oil },
    { path: '/oil/new', name: 'extraction-new', component: Extraction },
    { path: '/oil/:id', name: 'extraction', component: Extraction },
    { path: '/money', name: 'money', component: Soon, props: { textKey: 'soon.money' } },
    { path: '/reports', name: 'reports', component: Soon, props: { textKey: 'soon.reports' } },
    { path: '/more', name: 'more', component: More },
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/:rest(.*)', redirect: '/' },
  ],
  scrollBehavior: (to) => (to.hash ? { el: to.hash } : { top: 0 }),
});
