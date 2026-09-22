import { defineStore } from 'pinia'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import { DocumentSession, DocStatus } from '@/session/document-session'
import { welcomeDocument } from '@/editor/documents'

/**
 * Pinia 适配层：DocumentSession（单一事实源）<-> Vue 响应式。
 * 会话对象本身是框架无关的普通类，用 shallowRef + subscribe 触发刷新，
 * 所有读写都经过 session 方法，保证不变量（见 document-session.js 顶部注释）。
 */
export const useEditorStore = defineStore('editor', () => {
  const session = shallowRef(new DocumentSession({ defaultContent: welcomeDocument }))
  // 会话通过 subscribe 通知外部；这里把通知转成 shallowRef 的 trigger
  session.value.subscribe(() => triggerRef(session))

  // 初始会话自带一份欢迎文稿（标记为已保存基线：用户开始输入前不算未保存）
  session.value.createDocuments([{ name: 'untitled.md', content: welcomeDocument, saved: true }])

  // 光标信息属于“当前编辑器视图”的瞬态 UI 状态，不归属任何文稿记录
  const cursorLine = ref(1)
  const cursorCol = ref(1)

  // ---------- 列表 / 当前文稿（四份视图必须同指一份内容） ----------
  const documents = computed(() => session.value.getRecords())
  const activeId = computed(() => session.value.activeId)
  const activeDocument = computed(() => session.value.getActiveRecord())
  const fileName = computed(() => activeDocument.value?.fileName ?? '')
  const content = computed(() => activeDocument.value?.content ?? '')
  const isDirty = computed(() => {
    const a = activeDocument.value
    return !!a && session.value.isDirty(a.id)
  })
  const hasDirtyDocuments = computed(() => session.value.hasDirty())
  const docCount = computed(() => documents.value.length)

  const stats = computed(() => {
    const text = content.value
    return {
      chars: text.length,
      lines: text ? text.split('\n').length : 1,
      words: text.trim() ? text.trim().split(/\s+/).length : 0
    }
  })

  const statusText = computed(() =>
    `Ln ${cursorLine.value}, Col ${cursorCol.value} | ${stats.value.words} words | ${stats.value.chars} chars`
  )

  // ---------- 文稿操作（全部委托 session，结果回传给调用方做 UI 反馈） ----------
  function createDocuments(descriptors) {
    return session.value.createDocuments(descriptors)
  }

  function openDocuments(descriptors, loader) {
    return session.value.openDocuments(descriptors, loader)
  }

  function retryOpen(id, loader) {
    return session.value.retryOpen(id, loader)
  }

  function activate(id) {
    session.value.activate(id)
  }

  function updateContent(newContent, id) {
    session.value.updateContent(newContent, id)
  }

  function rename(id, name, options) {
    return session.value.rename(id, name, options)
  }

  function markSaved(id, patch) {
    session.value.markSaved(id, patch)
  }

  function close(id) {
    return session.value.close(id)
  }

  function closeMany(ids) {
    return session.value.closeMany(ids)
  }

  function getRecord(id) {
    return session.value.getRecord(id)
  }

  function isRecordDirty(id) {
    return session.value.isDirty(id)
  }

  function updateCursor(line, col) {
    cursorLine.value = line
    cursorCol.value = col
  }

  function resetCursor() {
    cursorLine.value = 1
    cursorCol.value = 1
  }

  return {
    // 常量
    DocStatus,
    // 状态
    documents,
    activeId,
    activeDocument,
    fileName,
    content,
    isDirty,
    hasDirtyDocuments,
    docCount,
    cursorLine,
    cursorCol,
    stats,
    statusText,
    // 操作
    createDocuments,
    openDocuments,
    retryOpen,
    activate,
    updateContent,
    rename,
    markSaved,
    close,
    closeMany,
    getRecord,
    isRecordDirty,
    updateCursor,
    resetCursor
  }
})
