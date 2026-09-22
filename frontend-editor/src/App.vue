<template>
  <div class="app">
    <Toolbar @action="handleToolbarAction" @file-action="handleFileAction" />
    <DocumentTabs
      @activate="activateDoc"
      @close="requestClose"
      @close-others="requestCloseOthers"
      @close-all="requestCloseAll"
      @new-doc="newDocument"
      @new-doc-batch="newDocumentBatch"
      @open-docs="openDocuments"
      @rename="renameDocument"
    />
    <EditorPane
      ref="editorPane"
      @retry="retryDocument"
      @close="requestClose"
      @new-doc="newDocument"
    />
    <StatusBar />

    <ConfirmGuard
      :open="guard.open"
      :file-name="guard.fileName"
      :position-text="guard.positionText"
      @save="confirmSaveAndClose"
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
import DocumentTabs from '@/components/DocumentTabs.vue'
import EditorPane from '@/components/EditorPane.vue'
import StatusBar from '@/components/StatusBar.vue'
import ConfirmGuard from '@/components/ConfirmGuard.vue'
import { useEditorStore } from '@/stores/editor'
import { DocStatus } from '@/session/document-session'
import { pickFilesToOpen, readFileHandle, writeDocument } from '@/session/files'

const store = useEditorStore()
const editorPane = ref(null)

// ---------------- Toast ----------------
const toast = reactive({ visible: false, message: '', type: 'info' })
let toastTimer = null
function showToast(message, type = 'info') {
  toast.message = message
  toast.type = type
  toast.visible = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.visible = false }, 2400)
}

// ---------------- 编辑器命令 ----------------
function getView() {
  return editorPane.value?.getView?.() || null
}

function insertText(before, after = '') {
  const editorView = getView()
  if (!editorView) return
  const { from, to } = editorView.state.selection.main
  const sel = editorView.state.sliceDoc(from, to)
  const text = `${before}${sel || 'text'}${after}`
  editorView.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + before.length, head: from + before.length + (sel || 'text').length }
  })
  editorView.focus()
}

function insertLine(prefix) {
  const editorView = getView()
  if (!editorView) return
  const line = editorView.state.doc.lineAt(editorView.state.selection.main.head)
  editorView.dispatch({ changes: { from: line.from, to: line.from, insert: prefix } })
  editorView.focus()
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
      const editorView = getView()
      const pos = editorView.state.selection.main.head
      const line = editorView.state.doc.lineAt(pos)
      editorView.dispatch({ changes: { from: line.to, to: line.to, insert: '\n\n---\n\n' } })
      editorView.focus()
    }
  }
  const fn = map[action]
  if (fn) fn()
}

// ---------------- 新建 / 打开 ----------------
function newDocument() {
  if (guard.open) return
  const [r] = store.createDocuments()
  showToast(`已新建「${store.getRecord(r.id).fileName}」`, 'success')
}

function newDocumentBatch() {
  if (guard.open) return
  const res = store.createDocuments([{}, {}, {}])
  showToast(`已批量新建 ${res.length} 份文稿`, 'success')
}

async function openDocuments() {
  if (guard.open) return
  let picked
  try {
    picked = await pickFilesToOpen()
  } catch (e) {
    showToast(`无法打开文件选择器：${e.message || e}`, 'error')
    return
  }
  if (!picked.length) return

  const results = await store.openDocuments(picked, async (handle, name) => {
    try {
      return await readFileHandle(handle)
    } catch (e) {
      // 读不到（权限/文件损坏/编码错误）：交给会话记为该记录的 error
      throw new Error(`无法读取「${name}」：${e.message || e}`)
    }
  })

  const failed = results.filter(r => !r.ok && r.reason !== 'superseded')
  if (failed.length === 0) {
    const ok = results.filter(r => r.ok).length
    showToast(`成功打开 ${ok} 份文稿`, 'success')
  } else {
    showToast(`${results.length - failed.length} 份打开成功，${failed.length} 份失败`, 'warning')
  }
}

async function retryDocument(id) {
  const record = store.getRecord(id)
  if (!record) return
  const r = await store.retryOpen(id, async (handle, name) => {
    if (!handle) throw new Error('原始文件句柄已失效，请重新打开该文件')
    return readFileHandle(handle)
  })
  if (r.ok) showToast(`「${record.fileName}」已打开`, 'success')
  else if (r.reason !== 'not-error') showToast(`重试失败：${r.reason}`, 'error')
}

// ---------------- 保存 ----------------
/**
 * 保存指定文稿（默认当前）。
 * 保存当前文稿前必须先 flush 编辑器（“编辑后立即保存/关闭”不能漏最后一次输入）；
 * 非激活标签在切换离开时已经 flush 过，会话里的内容就是最新值。
 */
async function saveDocument(id = store.activeId) {
  // 先把当前编辑器的输入落进会话
  editorPane.value?.flushActive()
  const record = id != null ? store.getRecord(id) : null
  if (!record || record.status !== DocStatus.READY) return false

  try {
    const { savedName, handle } = await writeDocument(record)
    store.markSaved(record.id, { name: savedName, handle })
    showToast(`已保存「${savedName}」`, 'success')
    return true
  } catch (e) {
    if (e?.name === 'AbortError') {
      showToast('已取消保存', 'info')
    } else {
      showToast(`保存失败：${e.message || e}`, 'error')
    }
    return false
  }
}

async function saveActive() {
  return saveDocument(store.activeId)
}

// ---------------- 重命名 ----------------
function renameDocument({ id, name }) {
  try {
    const finalName = store.rename(id, name, { autoDedupe: false })
    showToast(`已重命名为「${finalName}」`, 'success')
  } catch (e) {
    if (e.code === 'DUPLICATE_NAME') {
      showToast(`文件名已存在：${name}`, 'warning')
    } else {
      showToast(`重命名失败：${e.message || e}`, 'error')
    }
  }
}

// ---------------- 未保存保护 + 关闭 ----------------
//
// 关键时序（题面“编辑后立即关闭”）：
//   flush 当前编辑器 -> 判断 dirty -> 弹窗 -> 保存/放弃/取消 -> closeMany。
// 批量关闭时按标签顺序逐个弹保护框，所有未保存文稿处理完后一次性关闭，
// 列表、当前文稿、文件名与保存状态始终同指一份内容。
const guard = reactive({
  open: false,
  queue: [],          // 待关闭 id（保持标签顺序）
  index: 0,
  total: 0,
  fileName: ''
})

const guardPositionText = () => {
  if (guard.total <= 1) return ''
  return `批量关闭中，第 ${guard.index + 1} / ${guard.total} 份需要处理`
}
// 模板里直接用 computed 不便于挂在 reactive 上，这里用方法渲染
guard.positionText = ''

function currentGuardId() {
  return guard.queue[guard.index]
}

/**
 * 入口：请求关闭一批标签。loading/error 记录没有未保存内容，直接跳过保护。
 */
function requestCloseMany(ids) {
  if (guard.open) return // 保护流程进行中，忽略新请求，避免状态交错
  // 关键：先把当前编辑器的输入同步进会话，dirty 判断才不会漏掉“编辑后立即关闭”
  editorPane.value?.flushActive()

  const needGuard = []
  const canClose = []
  for (const id of ids) {
    const r = store.getRecord(id)
    if (!r) continue // 未知记录：忽略（store 层方法也会显式抛错）
    if (r.status === DocStatus.READY && store.isRecordDirty(id)) needGuard.push(id)
    else canClose.push(id)
  }

  if (!needGuard.length) {
    if (canClose.length) doClose(canClose)
    return
  }

  // 先关无需保护的，再逐个保护
  if (canClose.length) doClose(canClose)

  guard.queue = needGuard
  guard.index = 0
  guard.total = needGuard.length
  openGuardAt()
}

function openGuardAt() {
  const id = currentGuardId()
  const record = store.getRecord(id)
  if (!record) { // 理论不会发生：未知 id 防御
    advanceGuard()
    return
  }
  guard.fileName = record.fileName
  guard.positionText = guardPositionText()
  guard.open = true
}

function advanceGuard() {
  guard.index += 1
  if (guard.index >= guard.queue.length) {
    finishGuard()
  } else {
    openGuardAt()
  }
}

function finishGuard() {
  guard.open = false
  guard.queue = []
  guard.index = 0
  guard.total = 0
  guard.positionText = ''
}

function cancelClose() {
  // 用户取消：剩余标签全部保留，不关闭任何尚未决定的记录
  finishGuard()
  showToast('已取消关闭', 'info')
}

function confirmDiscardAndClose() {
  const id = currentGuardId()
  guard.open = false
  if (id) doClose([id])
  advanceGuard()
}

async function confirmSaveAndClose() {
  const id = currentGuardId()
  const record = id ? store.getRecord(id) : null
  if (!record) { advanceGuard(); return }

  // 非激活标签在切换离开时内容已同步；当前标签由 saveDocument 内部 flush
  const ok = await saveDocument(id)
  guard.open = false
  if (ok) {
    doClose([id])
    advanceGuard()
  } else {
    // 保存失败/取消保存：中止整个关闭流程，后续标签保持不动
    finishGuard()
  }
}

/** 真正执行关闭；session 负责列表与当前文稿迁移的一致性 */
function doClose(ids) {
  if (!ids.length) return
  try {
    store.closeMany(ids)
  } catch (e) {
    if (e.code === 'UNKNOWN_DOCUMENT') {
      // 未知记录绝不允许影响其他标签
      showToast('存在未知文稿记录，已忽略该关闭请求', 'warning')
    } else {
      throw e
    }
  }
}

// 单标签 / 批量语义糖
function requestClose(id) { requestCloseMany([id]) }
function requestCloseOthers(id) {
  const others = store.documents.filter(d => d.id !== id).map(d => d.id)
  if (others.length) {
    // 离开当前标签前先 flush，避免丢失最后一次输入
    if (store.activeId !== id) {
      editorPane.value?.flushActive()
      store.activate(id)
    }
    requestCloseMany(others)
  }
}
function requestCloseAll() {
  requestCloseMany(store.documents.map(d => d.id))
}

function activateDoc(id) {
  if (guard.open) return // 保护流程中冻结切换，防止 flush/保存对错记录
  // 切换前 flush，保证离开的文稿不丢最后一次输入
  editorPane.value?.flushActive()
  store.activate(id)
}

// ---------------- 快捷键 ----------------
function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  // 未保存保护弹窗打开时冻结所有文稿级快捷键，避免流程交错
  if (guard.open) { e.preventDefault(); return }
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    saveActive()
  } else if (key === 'n' && e.altKey) {
    e.preventDefault()
    newDocument()
  } else if (key === 'o' && !e.altKey) {
    e.preventDefault()
    openDocuments()
  } else if (key === 'w') {
    e.preventDefault()
    if (store.activeId) requestClose(store.activeId)
  }
}

// 关闭/刷新整页时保护未保存内容
function onBeforeUnload(e) {
  if (store.hasDirtyDocuments) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<style lang="scss" scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg;
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
