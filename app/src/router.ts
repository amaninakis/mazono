import { createRouter, createWebHistory } from 'vue-router'
import ExtractionPage from './screens/ExtractionPage.vue'
import JournalPage from './screens/JournalPage.vue'
import MoneyPage from './screens/MoneyPage.vue'
import MorePage from './screens/MorePage.vue'
import OilPage from './screens/OilPage.vue'
import ReportsPage from './screens/ReportsPage.vue'
import SettingsPage from './screens/SettingsPage.vue'
import TodayPage from './screens/TodayPage.vue'
import TransactionPage from './screens/TransactionPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'today', component: TodayPage },
    { path: '/entry/:id', name: 'entry', component: TodayPage },
    { path: '/journal', name: 'journal', component: JournalPage },
    { path: '/oil', name: 'oil', component: OilPage },
    { path: '/oil/new', name: 'extraction-new', component: ExtractionPage },
    { path: '/oil/:id', name: 'extraction', component: ExtractionPage },
    { path: '/money', name: 'money', component: MoneyPage },
    { path: '/money/new/:kind', name: 'transaction-new', component: TransactionPage },
    { path: '/money/:id', name: 'transaction', component: TransactionPage },
    { path: '/reports', name: 'reports', component: ReportsPage },
    { path: '/more', name: 'more', component: MorePage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/:rest(.*)', redirect: '/' },
  ],
  scrollBehavior: (to) => (to.hash ? { el: to.hash } : { top: 0 }),
})
