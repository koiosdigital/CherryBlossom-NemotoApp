<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Card,
  CardContent,
  Button,
  Badge,
  Switch,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui'
import { Plus, Clock, Calendar, MoreHorizontal } from 'lucide-vue-next'

type Schedule = {
  id: string
  name: string
  time: string
  days: string[]
  preset: string
  enabled: boolean
}

const schedules = ref<Schedule[]>([
  {
    id: 'morning',
    name: 'Morning boot',
    time: '08:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    preset: 'Lobby welcome',
    enabled: true,
  },
  {
    id: 'arrivals',
    name: 'Arrivals window',
    time: '14:00',
    days: ['Mon', 'Wed', 'Fri'],
    preset: 'Arrivals',
    enabled: true,
  },
  {
    id: 'afterhours',
    name: 'After hours',
    time: '18:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    preset: 'After hours',
    enabled: true,
  },
  {
    id: 'weekend',
    name: 'Weekend freeze',
    time: '00:00',
    days: ['Sat', 'Sun'],
    preset: 'After hours',
    enabled: false,
  },
])

const tab = ref<'active' | 'disabled' | 'all'>('active')

const visible = computed(() => {
  if (tab.value === 'active') return schedules.value.filter((s) => s.enabled)
  if (tab.value === 'disabled') return schedules.value.filter((s) => !s.enabled)
  return schedules.value
})

const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <span class="eyebrow">Automation</span>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Schedules
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Fire presets automatically. Quiet hours override all schedules.
          </p>
        </div>
        <Button>
          <Plus />
          New schedule
        </Button>
      </div>
    </section>

    <Tabs v-model="tab" default-value="active">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled">Disabled</TabsTrigger>
        <TabsTrigger value="all">All</TabsTrigger>
      </TabsList>

      <TabsContent :value="tab">
        <div class="flex flex-col gap-3">
          <Card
            v-for="s in visible"
            :key="s.id"
            :class="!s.enabled ? 'opacity-60' : ''"
          >
            <CardContent class="flex flex-wrap items-center gap-4 py-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              >
                <Clock class="size-5" />
              </div>
              <div class="flex flex-col">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ s.name }}</span>
                  <Badge variant="outline" class="num">{{ s.time }}</Badge>
                </div>
                <div class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar class="size-3" />
                  <span
                    v-for="d in allDays"
                    :key="d"
                    class="px-0.5"
                    :class="
                      s.days.includes(d)
                        ? 'font-semibold text-foreground'
                        : 'opacity-40'
                    "
                  >
                    {{ d }}
                  </span>
                </div>
              </div>
              <Separator
                orientation="vertical"
                class="mx-1 hidden h-8 sm:block"
              />
              <div class="flex flex-col">
                <span class="eyebrow">Preset</span>
                <span class="text-sm font-medium">{{ s.preset }}</span>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <Switch v-model="s.enabled" />
                <Button variant="ghost" size="icon">
                  <MoreHorizontal />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card v-if="!visible.length">
            <CardContent class="flex flex-col items-center gap-2 py-16 text-center">
              <Clock class="size-8 text-muted-foreground" />
              <p class="display-face text-lg">No schedules here</p>
              <p class="text-sm text-muted-foreground">
                {{
                  tab === 'active'
                    ? 'Nothing is set to fire automatically.'
                    : tab === 'disabled'
                      ? 'All schedules are active.'
                      : 'Create your first schedule to automate a preset.'
                }}
              </p>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
