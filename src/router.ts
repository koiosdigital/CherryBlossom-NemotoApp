import { createRouter, createWebHashHistory } from 'vue-router'

const Dashboard = () => import('@/pages/Dashboard.vue')
const Presets = () => import('@/pages/Presets.vue')
const Schedules = () => import('@/pages/Schedules.vue')
const Settings = () => import('@/pages/Settings.vue')
const SettingsTime = () => import('@/pages/settings/Time.vue')
const SettingsModules = () => import('@/pages/settings/Modules.vue')
const SettingsNetwork = () => import('@/pages/settings/Network.vue')
const Editor = () => import('@/pages/Editor.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/presets', name: 'presets', component: Presets },
    { path: '/schedules', name: 'schedules', component: Schedules },
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/settings/time', name: 'settings.time', component: SettingsTime },
    {
      path: '/settings/modules',
      name: 'settings.modules',
      component: SettingsModules,
    },
    {
      path: '/settings/network',
      name: 'settings.network',
      component: SettingsNetwork,
    },
    // Backwards-compat redirects for the now-merged settings pages.
    { path: '/settings/calibration', redirect: '/settings/modules' },
    { path: '/settings/grid', redirect: '/settings/modules' },
    { path: '/editor', name: 'editor', component: Editor },
  ],
})
