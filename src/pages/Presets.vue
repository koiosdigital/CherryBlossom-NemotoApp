<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Badge,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui'
import {
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import { useDisplay } from '@/composables/useDisplay'
import { useToast } from '@/composables/useToast'

type PresetMeta = components['schemas']['PresetMeta']

const router = useRouter()
const display = useDisplay()
const { toast } = useToast()

const presets = ref<PresetMeta[]>([])
const loading = ref(false)
const query = ref('')
const runningId = ref<number | null>(null)
const deletingId = ref<number | null>(null)

const deleteTarget = ref<PresetMeta | null>(null)

async function load() {
  loading.value = true
  try {
    const { data } = await apiClient.GET('/api/presets')
    if (data) presets.value = data.presets
  } finally {
    loading.value = false
  }
}

const filtered = computed(() =>
  presets.value.filter((p) =>
    p.name.toLowerCase().includes(query.value.toLowerCase())
  )
)

async function showPreset(p: PresetMeta) {
  runningId.value = p.id
  try {
    await display.showPreset(p.id, p.name)
    toast({ title: `Showing "${p.name}"`, variant: 'success' })
  } catch (e) {
    toast({
      title: "Couldn't show preset",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    runningId.value = null
  }
}

function editPreset(p: PresetMeta) {
  router.push({
    path: '/editor',
    query: { context: 'edit-preset', id: String(p.id) },
  })
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const id = deleteTarget.value.id
  deletingId.value = id
  try {
    const { error: err } = await apiClient.DELETE('/api/presets/{id}', {
      params: { path: { id } },
    })
    if (err) throw err
    presets.value = presets.value.filter((p) => p.id !== id)
    toast({ title: 'Preset deleted', variant: 'success' })
    deleteTarget.value = null
  } catch (e) {
    toast({
      title: "Couldn't delete",
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    })
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <span class="eyebrow">Library</span>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Presets
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Saved frames. Show one on demand or edit it in the paint tool.
          </p>
        </div>
        <RouterLink to="/editor?context=new-preset">
          <Button>
            <Plus />
            New preset
          </Button>
        </RouterLink>
      </div>
    </section>

    <Card>
      <CardHeader>
        <div class="flex items-center gap-3">
          <div class="relative max-w-sm flex-1">
            <Search
              class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="query"
              placeholder="Search presets..."
              class="pl-8"
            />
          </div>
          <Badge variant="outline" class="num">
            {{ filtered.length }} shown
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="px-0">
        <div v-if="loading" class="flex justify-center py-10">
          <Loader2 class="size-4 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="filtered.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="border-b border-border text-xs text-muted-foreground [&>th]:px-4 [&>th]:py-2 [&>th]:text-left"
              >
                <th>Name</th>
                <th class="hidden sm:table-cell">Size</th>
                <th class="w-48 text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in filtered"
                :key="p.id"
                class="border-b border-border last:border-b-0 transition-colors hover:bg-muted/40 [&>td]:px-4 [&>td]:py-3"
              >
                <td>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{{ p.name }}</span>
                    <Badge
                      v-if="display.currentPresetId.value === p.id"
                      variant="success"
                    >
                      Showing
                    </Badge>
                  </div>
                </td>
                <td
                  class="hidden text-xs text-muted-foreground num sm:table-cell"
                >
                  {{ p.width }} × {{ p.height }}
                </td>
                <td>
                  <div class="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      :disabled="runningId !== null"
                      @click="showPreset(p)"
                      aria-label="Show on display"
                      title="Show on display"
                    >
                      <Loader2
                        v-if="runningId === p.id"
                        class="animate-spin"
                      />
                      <Play v-else />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit"
                      title="Edit"
                      @click="editPreset(p)"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                      title="Delete"
                      @click="deleteTarget = p"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div
          v-else
          class="px-6 py-12 text-center text-sm text-muted-foreground"
        >
          <p v-if="query">No presets match "{{ query }}".</p>
          <p v-else>
            No presets yet. Create one in the
            <RouterLink
              to="/editor?context=new-preset"
              class="text-primary hover:underline"
            >
              editor
            </RouterLink>.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- Delete confirm -->
    <Dialog
      :open="deleteTarget !== null"
      @update:open="(v) => !v && (deleteTarget = null)"
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete preset?</DialogTitle>
          <DialogDescription>
            Removes "{{ deleteTarget?.name }}" from the library. This can't
            be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            :disabled="deletingId !== null"
            @click="confirmDelete"
          >
            <Loader2 v-if="deletingId !== null" class="animate-spin" />
            <Trash2 v-else />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
