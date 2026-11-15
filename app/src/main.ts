import I18NextVue from 'i18next-vue'
import { registerSW } from 'virtual:pwa-register'
import { createApp } from 'vue'
import App from './App.vue'
import i18next from './i18n'
import { router } from './router'
import './styles.css'

registerSW({ immediate: true })

// Ask the browser to keep our data even when storage runs low.
void navigator.storage?.persist?.()

createApp(App).use(router).use(I18NextVue, { i18next }).mount('#root')
