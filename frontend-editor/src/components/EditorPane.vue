<template>
  <div class="editor-pane" :class="{ 'editor-pane--empty': !store.hasDocuments }">
    <div ref="editorContainer" class="editor-pane__cm"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { createEditorState, buildExtensions } from '@/editor/setup'
import { useDocumentsStore } from '@/stores/documents'

const editorContainer = ref(null)
const store = useDocumentsStore()

let editorView = null
// The id currently displayed (null = blank state). Prevents redundant
// setState calls when both watchers react to closing the last document.
let boundId

// One independent EditorState per document id. Keeping the states here (not in
// the reactive store) preserves each document's own undo history, selection
// and scroll position across tab switches.
const statesById = new Map()
// Remember scroll ratio per document so switching tabs restores the position.
const scrollById = new Map()

/**
 * Build the update listener bound to a concrete document id. Every keystroke
 * is synchronously written back to the owning record. Content-equality is
 * checked inside syncContent, and writes for unknown ids are dropped, so a
 * switch or a close racing with an update can never corrupt another document.
 */
function makeListener(id) {
  return function onUpdate(update) {
    if (update.docChanged) {
      store.syncContent(id, update.state.doc.toString())
    }
    if (update.selectionSet || update.docChanged) {
      // Selection only matters while this state is the one being shown.
      if (store.activeId === id) {
        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        store.updateCursor(line.number, pos - line.from + 1)
      }
    }
  }
}

function getOrCreateState(id) {
  let state = statesById.get(id)
  if (state) return state
  const doc = store.getDoc(id)
  state = createEditorState({
    doc: doc ? doc.content : '',
    onUpdate: makeListener(id)
  })
  statesById.set(id, state)
  return state
}

/** A minimal blank state shown when there are no open documents. */
function createBlankState() {
  return EditorState.create({ doc: '', extensions: buildExtensions() })
}

function saveScrollOf(id) {
  if (!editorView || !id) return
  const dom = editorView.scrollDOM
  const max = dom.scrollHeight - dom.clientHeight
  scrollById.set(id, max > 0 ? dom.scrollTop / max : 0)
}

function restoreScrollOf(id) {
  if (!editorView) return
  nextTick(() => {
    const dom = editorView.scrollDOM
    const ratio = scrollById.get(id) ?? 0
    const max = dom.scrollHeight - dom.clientHeight
    dom.scrollTop = Math.max(0, ratio * max)
  })
}

function bindToActive(id) {
  if (!editorView || boundId === id) return
  if (!id) {
    editorView.setState(createBlankState())
    boundId = null
    return
  }
  // Capture the cursor of the document we are about to display.
  const state = getOrCreateState(id)
  editorView.setState(state)
  boundId = id
  const pos = state.selection.main.head
  const line = state.doc.lineAt(pos)
  store.updateCursor(line.number, pos - line.from + 1)
  restoreScrollOf(id)
}

onMounted(() => {
  if (!editorContainer.value) return
  editorView = new EditorView({
    state: createBlankState(),
    parent: editorContainer.value
  })
  boundId = null
  if (store.activeId) bindToActive(store.activeId)
})

// Switch documents whenever the active id changes.
watch(
  () => store.activeId,
  (newId, oldId) => {
    if (oldId) saveScrollOf(oldId)
    if (!editorView) return
    bindToActive(newId)
  }
)

// If the last document is closed, tear down its state and show the blank view.
watch(
  () => store.docs.map((d) => d.id),
  (ids, oldIds) => {
    const live = new Set(ids)
    for (const id of oldIds || []) {
      if (!live.has(id)) {
        statesById.delete(id) // unknown / closed state is discarded entirely
        scrollById.delete(id)
      }
    }
    if (!store.activeId && editorView) bindToActive(null)
  }
)

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
  statesById.clear()
  scrollById.clear()
})

defineExpose({
  getView: () => editorView,
  /** Imperatively focus the active editor (used after toolbar actions). */
  focus: () => editorView?.focus()
})
</script>

<style lang="scss" scoped>
.editor-pane {
  flex: 1;
  overflow: hidden;
  background: $bg-editor;
  position: relative;

  &__cm {
    height: 100%;
  }

  &--empty {
    .cm-editor {
      opacity: 0;
      pointer-events: none;
    }
  }
}
</style>
