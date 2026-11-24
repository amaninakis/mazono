import I18NextVue from 'i18next-vue'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import { openLocalDatabase } from './db/db'
import i18next from './i18n'
import { router } from './router'
import { startAccount } from './sync/account'
// First, before anything reads them: settings saved under the app's first name move over.
import './ui/oldNames'
import './styles.css'
import 'virtual:nuxt-icon-bundle/register'

registerSW({ immediate: true })

// Ask the browser to keep our data even when storage runs low.
void navigator.storage?.persist?.()

// Which database on this phone holds the grove (its first name or Mazono), then start:
// is there a sync server, and who is signed in? (The app shows a loading screen meanwhile.)
void openLocalDatabase().then(() => {
  void startAccount()
  createApp(App).use(router).use(I18NextVue, { i18next }).mount('#root')
})
