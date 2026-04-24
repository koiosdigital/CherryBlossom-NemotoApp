import { createRouter, createWebHashHistory } from 'vue-router'

const Dashboard = () => import('@/pages/Dashboard.vue')
const Presets = () => import('@/pages/Presets.vue')
const Schedules = () => import('@/pages/Schedules.vue')
const Settings = () => import('@/pages/Settings.vue')
const SettingsTime = () => import('@/pages/settings/Time.vue')
const SettingsCalibration = () => import('@/pages/settings/Calibration.vue')
const SettingsGrid = () => import('@/pages/settings/Grid.vue')
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
      path: '/settings/calibration',
      name: 'settings.calibration',
      component: SettingsCalibration,
    },
    { path: '/settings/grid', name: 'settings.grid', component: SettingsGrid },
    { path: '/editor', name: 'editor', component: Editor },
  ],
})
