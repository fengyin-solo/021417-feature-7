import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { uniqueFileName, ensureMarkdownExt } from '@/utils/file-name'
import { loadDocuments, saveDocuments } from '@/utils/persistence'
import { DEFAULT_DOC } from '@/editor/default-doc'

let seq = 0
function genId() {
  // Deterministic, collision-free id. Avoids random values so the same id is
  // observed regardless of how many times the module graph is evaluated, and
  // never depends on crypto being available.
  seq += 1
  return `doc-${Date.now().toString(36)}-${seq}`
}

function computeStats(text) {
  const charCount = text.length
  const lineCount = text ? text.split('\n').length : 1
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  return { charCount, lineCount, wordCount }
}

/**
 * The documents store is the single source of truth for the whole session:
 * every tab, the active tab, file names, live contents and saved snapshots
 * live here. CodeMirror EditorStates (one per document) are kept by the
 * EditorPane and only mirror `content`; they are never authoritative.
 *
 * Invariant: for every document the triple (fileName, content, dirty state)
 * always describes the SAME record. A document is dirty exactly when its
 * live content differs from its last saved snapshot. Operations targeting an
 * id that no longer exists are rejected without mutating anything.
 */
export const useDocumentsStore = defineStore('documents', () => {
  /** @type {import('vue').Ref<Array<{id:string, fileName:string, content:string, savedContent:string}>>} */
  const docs = ref([])
  const activeId = ref(null)
  const cursorLine = ref(1)
  const cursorCol = ref(1)

  const activeDoc = computed(() => docs.value.find((d) => d.id === activeId.value) || null)
  const hasDocuments = computed(() => docs.value.length > 0)

  const stats = computed(() => computeStats(activeDoc.value?.content ?? ''))
  const wordCount = computed(() => stats.value.wordCount)
  const charCount = computed(() => stats.value.charCount)
  const lineCount = computed(() => stats.value.lineCount)
  const isDirty = computed(() => (activeDoc.value ? activeDoc.value.content !== activeDoc.value.savedContent : false))
  const fileName = computed(() => activeDoc.value?.fileName ?? '')

  const statusText = computed(() => {
    if (!activeDoc.value) return 'No document open'
    return `Ln ${cursorLine.value}, Col ${cursorCol.value} | ${wordCount.value} words | ${charCount.value} chars`
  })

  // ---------- internal helpers ----------

  /**
   * Ids that have an on-disk snapshot in THIS session (seeded/restored docs,
   * explicitly saved docs, or freshly opened files). A document is persisted
   * only while it both is still open and belongs to this set, so closing a
   * tab removes its disk mirror while leaving unrelated records untouched.
   */
  const savedIds = new Set()

  function persist() {
    saveDocuments(
      docs.value
        .filter((d) => savedIds.has(d.id))
        .map((d) => ({ id: d.id, fileName: d.fileName, savedContent: d.savedContent }))
    )
  }

  function getDoc(id) {
    return docs.value.find((d) => d.id === id) || null
  }

  function isDocDirty(id) {
    const doc = getDoc(id)
    return !!doc && doc.content !== doc.savedContent
  }

  function dirtyIdsAmong(ids) {
    return ids.filter((id) => isDocDirty(id))
  }

  /**
   * Choose which document stays active after some documents are removed.
   * Prefers the closest surviving tab to the first removed tab: the tab
   * immediately to its right, else the one immediately to its left.
   */
  function resolveActiveAfterRemoval(removingIds) {
    if (activeId.value && !removingIds.includes(activeId.value)) return activeId.value
    if (docs.value.length === 0) return null

    const removedSet = new Set(removingIds)
    const firstRemovedIdx = docs.value.findIndex((d) => removedSet.has(d.id))

    for (let i = firstRemovedIdx + 1; i < docs.value.length; i += 1) {
      if (!removedSet.has(docs.value[i].id)) return docs.value[i].id
    }
    for (let i = firstRemovedIdx - 1; i >= 0; i -= 1) {
      if (!removedSet.has(docs.value[i].id)) return docs.value[i].id
    }
    return null
  }

  // ---------- lifecycle / bootstrap ----------

  /**
   * Restore saved snapshots from disk, or seed the welcome document on
   * first run. Unknown / corrupt records are skipped, never merged.
   * @returns {{ restored: number, skipped: number, storageError: boolean }}
   */
  function init() {
    savedIds.clear()
    const { docs: loaded, skipped, error } = loadDocuments()
    if (loaded.length > 0) {
      docs.value = loaded.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        content: r.savedContent, // restored snapshot → opens clean
        savedContent: r.savedContent
      }))
      docs.value.forEach((d) => savedIds.add(d.id))
      activeId.value = docs.value[0].id
      return { restored: docs.value.length, skipped, storageError: error }
    }

    // First run (or an empty store): seed one welcome document.
    const id = genId()
    docs.value = [{ id, fileName: 'welcome.md', content: DEFAULT_DOC, savedContent: DEFAULT_DOC }]
    activeId.value = id
    savedIds.add(id)
    persist()
    return { restored: 0, skipped, storageError: error }
  }

  // ---------- creation / opening ----------

  /**
   * Create one or more brand-new empty documents in one batch.
   * @param {number|string[]} [spec=1] - how many, or desired base names
   * @returns {string[]} the created ids (last one becomes active)
   */
  function newDocuments(spec = 1) {
    const desired = Array.isArray(spec) ? spec : Array.from({ length: spec }, () => 'untitled.md')
    const created = []
    for (const base of desired) {
      const name = uniqueFileName(base || 'untitled.md', docs.value.map((d) => d.fileName))
      const id = genId()
      docs.value.push({ id, fileName: name, content: '', savedContent: '' })
      created.push(id)
    }
    if (created.length > 0) activeId.value = created[created.length - 1]
    return created
  }

  /**
   * Open several documents at once from externally read file contents.
   * File names are de-duplicated against the whole session (including other
   * files in the same batch). Invalid records are rejected and reported;
   * accepted content is stored byte-for-byte and never altered.
   * @param {Array<{name:string, content:string}>} items
   * @returns {{ openedIds: string[], rejected: Array<{name:string, reason:string}> }}
   */
  function openDocuments(items) {
    const openedIds = []
    const rejected = []

    for (const item of items || []) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) {
        rejected.push({ name: item?.name ?? 'unknown', reason: '文件名无效' })
        continue
      }
      if (typeof item.content !== 'string') {
        rejected.push({ name: item.name, reason: '内容无法读取' })
        continue
      }
      const name = uniqueFileName(ensureMarkdownExt(item.name), docs.value.map((d) => d.fileName))
      const id = genId()
      // A freshly opened file is considered saved at its on-disk content.
      docs.value.push({ id, fileName: name, content: item.content, savedContent: item.content })
      savedIds.add(id)
      openedIds.push(id)
    }

    if (openedIds.length > 0) {
      activeId.value = openedIds[openedIds.length - 1]
      persist()
    }
    return { openedIds, rejected }
  }

  // ---------- activation ----------

  /**
   * Switch the active document. Unknown ids are ignored and the active tab is
   * left untouched, so the list / current document can never disagree.
   * @returns {boolean}
   */
  function activate(id) {
    if (id !== null && !getDoc(id)) return false
    if (activeId.value === id) return true
    activeId.value = id
    cursorLine.value = 1
    cursorCol.value = 1
    return true
  }

  // ---------- live editing ----------

  /**
   * Record an edit coming from a document's CodeMirror state.
   * Guarded on BOTH id ownership and content equality:
   *  - writes for an unknown (already closed / never existed) id are dropped,
   *  - identical content (e.g. setState during tab switches) is a no-op and
   *    can never flip the dirty flag or touch another document.
   * @returns {boolean} whether the id was a known record
   */
  function syncContent(id, content) {
    if (typeof content !== 'string') return false
    const doc = getDoc(id)
    if (!doc) return false
    if (doc.content === content) return true
    doc.content = content
    return true
  }

  function updateCursor(line, col) {
    cursorLine.value = line
    cursorCol.value = col
  }

  // ---------- renaming ----------

  /**
   * Rename a document. Empty names and collisions (case-insensitive,
   * ignoring the document itself) are rejected without mutating state.
   * @returns {{ ok: boolean, reason?: string, name?: string }}
   */
  function renameDocument(id, desired) {
    const doc = getDoc(id)
    if (!doc) return { ok: false, reason: 'unknown' }
    const candidate = ensureMarkdownExt(desired || '')
    if (!desired || !desired.trim()) return { ok: false, reason: 'empty' }

    const lower = candidate.toLowerCase()
    const collision = docs.value.some((d) => d.id !== id && d.fileName.toLowerCase() === lower)
    if (collision) return { ok: false, reason: 'duplicate', name: candidate }

    doc.fileName = candidate
    persist()
    return { ok: true, name: candidate }
  }

  // ---------- saving ----------

  /**
   * Mark a document's current content as its saved snapshot and persist it.
   * Unknown ids fail without touching any other document.
   * @returns {{ ok: boolean }}
   */
  function save(id) {
    const doc = getDoc(id)
    if (!doc) return { ok: false }
    doc.savedContent = doc.content
    savedIds.add(id)
    persist()
    return { ok: true }
  }

  /**
   * Save several documents (e.g. "save all" while closing). Existing ids are
   * saved; unknown ids are reported back and change nothing.
   * @returns {{ saved: string[], missing: string[] }}
   */
  function saveMany(ids) {
    const saved = []
    const missing = []
    for (const id of ids) {
      const doc = getDoc(id)
      if (doc) {
        doc.savedContent = doc.content
        savedIds.add(id)
        saved.push(id)
      } else {
        missing.push(id)
      }
    }
    if (saved.length > 0) persist()
    return { saved, missing }
  }

  // ---------- closing ----------

  /**
   * Remove one or more documents from the session. The caller is responsible
   * for guarding unsaved content beforehand (close* never silently drops dirty
   * content). The active tab is moved deterministically to the nearest
   * surviving tab; unknown ids are ignored and never cause a real document to
   * be removed.
   *
   * Closing removes tabs from the session and drops their local session
   * mirror; a never-saved new document leaves no trace. Other open documents'
   * records are re-persisted unchanged, so their content can't be affected.
   * @param {string[]} ids
   * @returns {{ removed: string[], missing: string[], activeId: string|null }}
   */
  function closeDocuments(ids) {
    const idSet = new Set(ids)
    const removed = []
    const missing = []
    for (const id of idSet) {
      if (getDoc(id)) removed.push(id)
      else missing.push(id)
    }
    if (removed.length === 0) {
      return { removed, missing, activeId: activeId.value }
    }

    const nextActiveId = resolveActiveAfterRemoval(removed)
    docs.value = docs.value.filter((d) => !idSet.has(d.id))
    for (const id of removed) savedIds.delete(id)
    activeId.value = nextActiveId
    if (!nextActiveId) {
      cursorLine.value = 1
      cursorCol.value = 1
    }
    persist()
    return { removed, missing, activeId: nextActiveId }
  }

  return {
    // state
    docs,
    activeId,
    cursorLine,
    cursorCol,
    // getters
    activeDoc,
    hasDocuments,
    wordCount,
    charCount,
    lineCount,
    isDirty,
    fileName,
    statusText,
    // helpers
    getDoc,
    isDocDirty,
    dirtyIdsAmong,
    // lifecycle
    init,
    // mutations
    newDocuments,
    openDocuments,
    activate,
    syncContent,
    updateCursor,
    renameDocument,
    save,
    saveMany,
    closeDocuments
  }
})
