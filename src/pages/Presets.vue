<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
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
  Globe,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { apiClient } from '@/api'
import type { components } from '@/api.d'
import DisplayCell from '@/components/DisplayCell.vue'
import { useDisplay } from '@/composables/useDisplay'
import { useToast } from '@/composables/useToast'
import { friendlyError } from '@/lib/errors'

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

// Treat a missing `source` (legacy firmware) as a static preset.
function isUrl(p: PresetMeta): boolean {
  return p.source === 'url'
}

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
    toast({
      title: isUrl(p) ? `Fetching "${p.name}"…` : `Showing "${p.name}"`,
      variant: 'success',
    })
  } catch (e) {
    toast({
      title: "Couldn't show preset",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    runningId.value = null
  }
}

function editPreset(p: PresetMeta) {
  if (isUrl(p)) {
    openUrlDialog(p)
    return
  }
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
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    deletingId.value = null
  }
}

// ---------------------------------------------------------------------------
// URL preset create/edit dialog (+ in-browser preview)
// ---------------------------------------------------------------------------

const urlDialogOpen = ref(false)
const urlEditingId = ref<number | null>(null)
const urlForm = reactive({ name: '', url: '' })
const saving = ref(false)

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' } // 204 No Content
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: number[][] }

const preview = ref<PreviewState>({ status: 'idle' })

const canSaveUrl = computed(
  () => urlForm.name.trim().length > 0 && /^https?:\/\//i.test(urlForm.url.trim())
)

function openUrlDialog(p?: PresetMeta) {
  urlEditingId.value = p ? p.id : null
  urlForm.name = p?.name ?? ''
  urlForm.url = p?.url ?? ''
  preview.value = { status: 'idle' }
  urlDialogOpen.value = true
}

async function runPreview() {
  const url = urlForm.url.trim()
  if (!/^https?:\/\//i.test(url)) return
  preview.value = { status: 'loading' }
  try {
    // The browser fetches the channel URL directly (the board's own fetch is
    // NOT subject to CORS — this preview is).
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 204) {
      preview.value = { status: 'empty' }
      return
    }
    if (!res.ok) {
      preview.value = { status: 'error', message: `Server returned HTTP ${res.status}.` }
      return
    }
    const data = await res.json()
    if (
      !Array.isArray(data) ||
      data.length === 0 ||
      !Array.isArray(data[0]) ||
      !data.every(
        (row: unknown) =>
          Array.isArray(row) &&
          row.length === (data[0] as unknown[]).length &&
          row.every((c) => typeof c === 'number' && c >= 0 && c <= 63)
      )
    ) {
      preview.value = {
        status: 'error',
        message: 'Expected a rectangular 2-D array of flap indexes (0–63).',
      }
      return
    }
    preview.value = { status: 'ok', rows: data as number[][] }
  } catch {
    preview.value = {
      status: 'error',
      message:
        'Fetch failed — usually CORS. The board fetches this URL server-side (no CORS), but the browser preview needs the URL to allow cross-origin GET.',
    }
  }
}

async function saveUrl() {
  if (!canSaveUrl.value) return
  saving.value = true
  const body = { name: urlForm.name.trim(), url: urlForm.url.trim() }
  try {
    if (urlEditingId.value != null) {
      const { error: err } = await apiClient.PUT('/api/presets/{id}', {
        params: { path: { id: urlEditingId.value } },
        body,
      })
      if (err) throw err
    } else {
      const { error: err } = await apiClient.POST('/api/presets', { body })
      if (err) throw err
    }
    toast({
      title: urlEditingId.value != null ? 'URL preset updated' : 'URL preset created',
      variant: 'success',
    })
    urlDialogOpen.value = false
    await load()
  } catch (e) {
    toast({
      title: "Couldn't save",
      description: friendlyError(e),
      variant: 'destructive',
    })
  } finally {
    saving.value = false
  }
}

const previewCols = computed(() =>
  preview.value.status === 'ok' ? preview.value.rows[0]?.length ?? 0 : 0
)
const previewRows = computed(() =>
  preview.value.status === 'ok' ? preview.value.rows.length : 0
)
const PREVIEW_SCALE = 0.4

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-6">
    <section class="flex flex-col gap-2">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="display-face text-3xl font-semibold tracking-tight">
            Presets
          </h1>
          <p class="max-w-xl text-sm text-muted-foreground">
            Saved displays you can show on demand — a fixed layout, or a URL the
            board fetches live.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" @click="openUrlDialog()">
            <Globe />
            New URL preset
          </Button>
          <RouterLink to="/editor?context=new-preset">
            <Button>
              <Plus />
              New preset
            </Button>
          </RouterLink>
        </div>
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
                <th class="hidden sm:table-cell">Source</th>
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
                    <Badge v-if="isUrl(p)" variant="secondary" class="gap-1">
                      <Globe class="size-3" />
                      URL
                    </Badge>
                  </div>
                  <p
                    v-if="isUrl(p) && p.url"
                    class="mt-0.5 max-w-xs truncate text-xs text-muted-foreground"
                    :title="p.url"
                  >
                    {{ p.url }}
                  </p>
                </td>
                <td
                  class="hidden text-xs text-muted-foreground num sm:table-cell"
                >
                  <template v-if="isUrl(p)">Live URL</template>
                  <template v-else>{{ p.width }} × {{ p.height }}</template>
                </td>
                <td>
                  <div class="flex justify-end gap-1">
                    <Button
                      size="sm"
                      :disabled="runningId !== null || display.currentPresetId.value === p.id"
                      @click="showPreset(p)"
                    >
                      <Loader2
                        v-if="runningId === p.id"
                        class="animate-spin"
                      />
                      <Play v-else />
                      {{ display.currentPresetId.value === p.id ? 'Showing' : 'Show' }}
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
            </RouterLink>
            or add a
            <button class="text-primary hover:underline" @click="openUrlDialog()">
              URL preset
            </button>.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- URL preset create/edit -->
    <Dialog
      :open="urlDialogOpen"
      @update:open="(v) => (urlDialogOpen = v)"
    >
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {{ urlEditingId != null ? 'Edit URL preset' : 'New URL preset' }}
          </DialogTitle>
          <DialogDescription>
            The board GETs this URL when the preset is shown or scheduled. It
            must return a 2-D array of flap indexes (0–63) matching the board
            size, or <span class="num">204 No Content</span> to leave the display
            unchanged.
          </DialogDescription>
        </DialogHeader>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="url-preset-name">Name</label>
            <Input
              id="url-preset-name"
              v-model="urlForm.name"
              maxlength="31"
              placeholder="e.g. Weather feed"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-sm font-medium" for="url-preset-url">URL</label>
            <Input
              id="url-preset-url"
              v-model="urlForm.url"
              maxlength="512"
              placeholder="https://…"
              @keyup.enter="runPreview"
            />
          </div>

          <div class="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="!/^https?:\/\//i.test(urlForm.url.trim()) || preview.status === 'loading'"
              @click="runPreview"
            >
              <Loader2 v-if="preview.status === 'loading'" class="animate-spin" />
              <Globe v-else />
              Preview
            </Button>
            <span class="text-xs text-muted-foreground">
              Fetched by your browser
            </span>
          </div>

          <!-- Preview outcomes -->
          <div
            v-if="preview.status === 'empty'"
            class="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            <span class="num">204 No Content</span> — the board would keep its
            current display.
          </div>
          <div
            v-else-if="preview.status === 'error'"
            class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {{ preview.message }}
          </div>
          <div
            v-else-if="preview.status === 'ok'"
            class="overflow-auto rounded-md border border-border p-3"
          >
            <div
              :style="{
                width: `${previewCols * 44 * PREVIEW_SCALE}px`,
                height: `${previewRows * 64 * PREVIEW_SCALE}px`,
              }"
            >
              <div
                class="grid origin-top-left gap-1"
                :style="{
                  transform: `scale(${PREVIEW_SCALE})`,
                  gridTemplateColumns: `repeat(${previewCols}, 44px)`,
                }"
              >
                <template v-for="(row, y) in preview.rows" :key="y">
                  <DisplayCell
                    v-for="(cell, x) in row"
                    :key="`${y}-${x}`"
                    :flap-index="cell"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button :disabled="!canSaveUrl || saving" @click="saveUrl">
            <Loader2 v-if="saving" class="animate-spin" />
            <Globe v-else />
            {{ urlEditingId != null ? 'Save' : 'Create' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
