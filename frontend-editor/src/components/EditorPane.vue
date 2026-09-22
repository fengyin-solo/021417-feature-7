<template>
  <div class="editor-pane" :class="{ 'editor-pane--disabled': !store.activeDocument }">
    <div v-show="ready" class="editor-pane__mount" ref="editorContainer"></div>

    <!-- 打开失败 -->
    <div v-if="activeDoc?.status === 'error'" class="editor-pane__overlay">
      <div class="doc-error">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p class="doc-error__title">「{{ activeDoc.fileName }}」打开失败</p>
        <p class="doc-error__msg">{{ activeDoc.error || '未知错误' }}</p>
        <div class="doc-error__actions">
          <button class="doc-error__btn doc-error__btn--primary" @click="emit('retry', activeDoc.id)">
            重试打开
          </button>
          <button class="doc-error__btn" @click="emit('close', activeDoc.id)">关闭标签</button>
        </div>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-else-if="activeDoc?.status === 'loading'" class="editor-pane__overlay">
      <div class="doc-loading">
        <span class="doc-loading__spinner" />
        <span>正在打开「{{ activeDoc.fileName }}」…</span>
      </div>
    </div>

    <!-- 没有打开的文稿 -->
    <div v-else-if="!activeDoc" class="editor-pane__overlay">
      <div class="doc-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <p>没有打开的文稿</p>
        <button class="doc-error__btn doc-error__btn--primary" @click="emit('new-doc')">
          新建文稿
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { createEditor, createEditorState } from '@/editor'
import { useEditorStore } from '@/stores/editor'

const store = useEditorStore()
const emit = defineEmits(['retry', 'close', 'new-doc'])

const editorContainer = ref(null)
const ready = ref(false)
const activeDoc = computed(() => store.activeDocument)

let editorView = null
// 每份文稿一份独立 EditorState（撤销/重做历史隔离），id 为键
const stateCache = new Map()
// 当前编辑器视图正在服务的记录 id；flush 只允许写回这同一份记录
let boundId = null
// 程序化切换 setState 期间屏蔽 updateListener，杜绝把切换内容误写回会话
let applyingSwitch = false

function makeOnUpdate() {
  return (update) => {
    if (applyingSwitch || boundId == null) return
    if (update.docChanged) {
      const record = store.getRecord(boundId)
      // 只在仍是当前激活记录、且处于可编辑态时回写（I1/I2 双保险）
      if (record?.status === 'ready' && boundId === store.activeId) {
        store.updateContent(update.state.doc.toString(), boundId)
      }
    }
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head
      const line = update.state.doc.lineAt(pos)
      store.updateCursor(line.number, pos - line.from + 1)
    }
  }
}

/**
 * 切换编辑器到某份记录对应的 State。
 * loading / error / null 时无可编辑内容，仅解除绑定。
 */
function applyStateFor(record) {
  if (!editorView) return

  if (!record || record.status !== 'ready') {
    boundId = null
    return
  }

  let state = stateCache.get(record.id)
  if (!state) {
    state = markRaw(createEditorState(record.content, makeOnUpdate()))
    stateCache.set(record.id, state)
  } else if (record.content !== state.doc.toString()) {
    // 记录内容来自缓存之外（如重试成功 / 外部改名后替换）：以会话内容为准
    state = markRaw(createEditorState(record.content, makeOnUpdate()))
    stateCache.set(record.id, state)
  }

  boundId = record.id
  applyingSwitch = true
  try {
    editorView.setState(state)
  } finally {
    applyingSwitch = false
  }

  const pos = state.selection.main.head
  const line = state.doc.lineAt(pos)
  store.updateCursor(line.number, pos - line.from + 1)
}

/**
 * 关闭前保护用：把编辑器中尚未同步的最后一次输入 flush 进会话。
 * 只写回当前绑定且激活的同一份记录——绝不会把 A 的编辑器内容写到 B。
 */
function flushActive() {
  if (!editorView || boundId == null || applyingSwitch) return
  if (boundId !== store.activeId) return
  const record = store.getRecord(boundId)
  if (record?.status !== 'ready') return
  const text = editorView.state.doc.toString()
  if (text !== record.content) store.updateContent(text, boundId)
}

/** 供“保存非激活标签”使用：非激活记录的内容在切换离开时已同步，无需经过编辑器 */
function flushDocument(id) {
  if (id === boundId) {
    flushActive()
    return
  }
  // 非激活记录没有挂载中的编辑器视图——其内容即会话中最新值，无需操作
}

function pruneStateCache() {
  const live = new Set(store.documents.map(d => d.id))
  for (const id of stateCache.keys()) {
    if (!live.has(id)) stateCache.delete(id)
  }
}

watch(() => store.activeId, (id, oldId) => {
  if (id === oldId) return
  pruneStateCache()
  applyStateFor(id != null ? store.getRecord(id) : null)
})

// 同一记录状态变化（loading->ready / error->ready 重试成功）后载入内容
watch(() => [activeDoc.value?.id, activeDoc.value?.status], ([id, status]) => {
  if (id && status === 'ready') applyStateFor(store.getRecord(id))
})

onMounted(() => {
  if (!editorContainer.value) return
  const first = store.activeDocument
  editorView = createEditor(editorContainer.value, {
    doc: first?.status === 'ready' ? first.content : '',
    onUpdate: makeOnUpdate()
  })
  ready.value = true
  applyStateFor(first || null)
})

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
  stateCache.clear()
  boundId = null
})

defineExpose({
  getView: () => editorView,
  flushActive,
  flushDocument
})
</script>

<style lang="scss" scoped>
.editor-pane {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: $bg-editor;

  &__mount {
    height: 100%;
  }

  &--disabled .editor-pane__mount {
    visibility: hidden;
  }

  &__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $bg-editor;
    z-index: 5;
  }
}

.doc-error,
.doc-empty,
.doc-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $sp-2;
  color: $text-3;
  font-size: $fs-sm;
  text-align: center;
  padding: $sp-5;
}

.doc-error {
  max-width: 420px;

  svg { color: $warning; }

  &__title {
    color: $text;
    font-size: $fs-base;
    font-weight: 600;
  }

  &__msg {
    font-family: $font-mono;
    font-size: $fs-xs;
    color: $text-2;
    word-break: break-all;
  }

  &__actions {
    display: flex;
    gap: $sp-2;
    margin-top: $sp-3;
  }

  &__btn {
    height: 32px;
    padding: 0 $sp-4;
    border: 1px solid $border;
    background: $bg-elevated;
    border-radius: $r-md;
    font-size: $fs-sm;
    color: $text-2;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover { border-color: $accent; color: $accent; }

    &--primary {
      background: $accent;
      border-color: $accent;
      color: #fff;
      &:hover { background: darken(#2563eb, 6%); color: #fff; }
    }
  }
}

.doc-loading {
  &__spinner {
    width: 22px;
    height: 22px;
    border: 2px solid $border;
    border-top-color: $accent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
