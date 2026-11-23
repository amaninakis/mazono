import I18NextVue from 'i18next-vue'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import i18next from './i18n'
import { router } from './router'
import { startAccount } from './sync/account'
import './styles.css'
import 'virtual:nuxt-icon-bundle/register'

registerSW({ immediate: true })

// Ask the browser to keep our data even when storage runs low.
void navigator.storage?.persist?.()

// Is there a sync server, and who is signed in? (The app shows a loading screen meanwhile.)
void startAccount()

createApp(App).use(router).use(I18NextVue, { i18next }).mount('#root')
