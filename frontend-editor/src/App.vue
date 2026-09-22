<template>
  <div class="app">
    <Toolbar
      @action="handleToolbarAction"
      @new-doc="newDocument"
      @open-files="openFilePicker"
      @save="saveActive"
    />
    <TabBar
      ref="tabBarRef"
      @toast="onTabToast"
      @request-close="requestClose"
      @request-close-all="requestCloseAll"
      @request-close-others="requestCloseOthers"
      @request-save="saveDocument"
      @request-open-files="handleFiles"
      @request-export="exportDocument"
    />

    <div class="workspace">
      <EditorPane ref="editorPane" />
      <EmptyState
        v-if="!store.hasDocuments"
        @new-doc="newDocument"
        @open-files="openFilePicker"
      />
    </div>

    <StatusBar />

    <ConfirmModal
      :open="modal.open"
      :multiple="modal.ids.length > 1"
      :title="modal.ids.length > 1 ? '是否保存以下文稿？' : '是否保存更改？'"
      :body="modal.ids.length > 1
        ? '以下文稿有尚未保存的更改，关闭后更改将丢失。'
        : '该文稿有尚未保存的更改，关闭后更改将丢失。'"
      :names="modal.names"
      @save="confirmSaveThenClose"
      @discard="confirmDiscardAndClose"
      @cancel="cancelClose"
    />

    <Transition name="toast">
      <div v-if="toast.visible" :class="['toast', `toast--${toast.type}`]">
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import Toolbar from '@/components/Toolbar.vue'
import TabBar from '@/components/TabBar.vue'
import EditorPane from '@/components/EditorPane.vue'
import StatusBar from '@/components/StatusBar.vue'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import { useDocumentsStore } from '@/stores/documents'
import { readFilesAsText } from '@/utils/file-reader'

const store = useDocumentsStore()
const editorPane = ref(null)
const tabBarRef = ref(null)

// ---------- toast ----------
const toast = reactive({ visible: false, message: '', type: 'info' })
let toastTimer = null
function showToast(message, type = 'info', duration = 2200) {
  toast.message = message
  toast.type = type
  toast.visible = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.visible = false }, duration)
}
function onTabToast(payload) {
  showToast(payload.message, payload.type)
}

// ---------- bootstrap ----------
onMounted(() => {
  const result = store.init()
  if (result.storageError) {
    showToast('检测到无法识别的本地记录，已安全跳过', 'warning', 3200)
  }
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// ---------- document creation / opening ----------
function newDocument() {
  store.newDocuments(1)
  showToast('已新建文档', 'success', 1400)
}

function openFilePicker() {
  tabBarRef.value?.triggerOpen()
}

async function handleFiles(fileList) {
  const { opened, failed } = await readFilesAsText(fileList)

  // Successful reads are committed together; rejected records never enter the list.
  const { openedIds, rejected } = store.openDocuments(opened)

  // Failures are reported individually and never overwrite any other document.
  const problems = [...failed, ...rejected.map((r) => ({ name: r.name, error: r.reason }))]
  if (openedIds.length > 0) {
    showToast(
      problems.length
        ? `已打开 ${openedIds.length} 篇，${problems.length} 篇失败`
        : `已打开 ${openedIds.length} 篇文档`,
      problems.length ? 'warning' : 'success'
    )
  } else if (problems.length) {
    showToast(`打开失败：${problems.map((p) => p.name).join('、')}`, 'error', 3200)
  }
  problems.forEach((p) => console.warn('[open] failed:', p.name, p.error))

  editorPane.value?.focus()
}

// ---------- saving ----------
function saveDocument(id) {
  const result = store.save(id)
  if (result.ok) showToast('已保存', 'success', 1200)
  else showToast('文稿不存在或已关闭，未执行保存', 'warning')
  return result.ok
}

function saveActive() {
  if (store.activeId) saveDocument(store.activeId)
}

function exportDocument(id) {
  const doc = store.getDoc(id)
  if (!doc) {
    showToast('文稿不存在或已关闭', 'warning')
    return
  }
  const blob = new Blob([doc.content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = doc.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  showToast(`已导出 ${doc.fileName}`, 'success', 1500)
}

// ---------- closing with unsaved-change protection ----------
const modal = reactive({ open: false, ids: [], names: [] })

function namesOf(ids) {
  return ids
    .map((id) => store.getDoc(id)?.fileName)
    .filter(Boolean)
}

/**
 * Ask to close one document. Clean documents close immediately; dirty ones
 * open the protection dialog first. Unknown ids are a reported no-op.
 */
function requestClose(id) {
  if (!store.getDoc(id)) {
    showToast('文稿不存在或已关闭', 'warning')
    return
  }
  const dirty = store.dirtyIdsAmong([id])
  if (dirty.length === 0) {
    finishClose([id])
  } else {
    openModal(dirty)
  }
}

function requestCloseAll() {
  const dirty = store.dirtyIdsAmong(store.docs.map((d) => d.id))
  if (dirty.length === 0) {
    finishClose(store.docs.map((d) => d.id))
  } else {
    openModal(dirty)
  }
}

function requestCloseOthers(keepId) {
  const targetIds = store.docs.map((d) => d.id).filter((id) => id !== keepId)
  const dirty = store.dirtyIdsAmong(targetIds)
  if (dirty.length === 0) {
    finishClose(targetIds)
  } else {
    openModal(dirty)
  }
}

function openModal(ids) {
  modal.ids = ids
  modal.names = namesOf(ids)
  modal.open = true
}

function confirmSaveThenClose() {
  // Save every dirty target first; unknown ids are reported by saveMany but
  // never alter other documents.
  const { saved } = store.saveMany(modal.ids)
  const stillKnown = modal.ids.filter((id) => store.getDoc(id))
  modal.open = false
  finishClose(stillKnown)
  if (saved.length) showToast(`已保存并关闭 ${saved.length} 篇`, 'success')
}

function confirmDiscardAndClose() {
  const ids = modal.ids.slice()
  modal.open = false
  finishClose(ids)
}

function cancelClose() {
  modal.open = false
  modal.ids = []
  modal.names = []
}

function finishClose(ids) {
  const { removed, missing } = store.closeDocuments(ids)
  if (missing.length) showToast('部分文稿已不存在，已忽略', 'warning')
  else if (removed.length) {
    // no toast for ordinary closes; content was already saved or explicitly discarded
  }
  modal.ids = []
  modal.names = []
}

// ---------- beforeunload: protect unsaved content on tab close/reload ----------
function onBeforeUnload(event) {
  const anyDirty = store.docs.some((d) => d.content !== d.savedContent)
  if (anyDirty) {
    event.preventDefault()
    event.returnValue = ''
  }
}

// ---------- keyboard shortcuts ----------
function onKeydown(event) {
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  const key = event.key.toLowerCase()
  if (key === 's') {
    event.preventDefault()
    saveActive()
  } else if (key === 'n') {
    event.preventDefault()
    newDocument()
  } else if (key === 'w') {
    event.preventDefault()
    if (store.activeId) requestClose(store.activeId)
  } else if (key === 'o') {
    event.preventDefault()
    openFilePicker()
  }
}

// ---------- toolbar text actions ----------
function insertText(before, after = '') {
  const view = editorPane.value?.getView()
  if (!view) return
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const text = `${before}${sel || 'text'}${after}`
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + before.length, head: from + before.length + (sel || 'text').length }
  })
  view.focus()
}

function insertLine(prefix) {
  const view = editorPane.value?.getView()
  if (!view) return
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  view.dispatch({ changes: { from: line.from, to: line.from, insert: prefix } })
  view.focus()
}

function handleToolbarAction(action) {
  const map = {
    bold: () => insertText('**', '**'),
    italic: () => insertText('*', '*'),
    strikethrough: () => insertText('~~', '~~'),
    code: () => insertText('`', '`'),
    link: () => insertText('[', '](url)'),
    image: () => insertText('![alt](', ')'),
    blockquote: () => insertLine('> '),
    'bullet-list': () => insertLine('- '),
    'ordered-list': () => insertLine('1. '),
    hr: () => {
      const view = editorPane.value?.getView()
      if (!view) return
      const pos = view.state.selection.main.head
      const line = view.state.doc.lineAt(pos)
      view.dispatch({ changes: { from: line.to, to: line.to, insert: '\n\n---\n\n' } })
      view.focus()
    },
  }
  const fn = map[action]
  if (fn) fn()
  else showToast(`未知操作: ${action}`, 'warning')
}
</script>

<style lang="scss" scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg;
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}

.toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  padding: $sp-2 $sp-5;
  border-radius: $r-full;
  font-size: $fs-sm;
  color: #fff;
  z-index: $z-toast;
  box-shadow: $shadow-lg;
  pointer-events: none;
  font-family: $font-ui;
  max-width: 80vw;

  &--info { background: $accent; }
  &--success { background: $success; }
  &--warning { background: $warning; }
  &--error { background: $error; }
}

.toast-enter-active,
.toast-leave-active {
  transition: all $t-slow $ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
