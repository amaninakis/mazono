/** App version, injected by Vite at build time. */
declare const APP_VERSION: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}
