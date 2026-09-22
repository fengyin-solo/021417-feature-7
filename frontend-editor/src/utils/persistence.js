/**
 * Local persistence of the saved document snapshots.
 *
 * Only the "saved" content of every document is persisted (never transient,
 * unsaved edits), so a reload never resurrects a file the user already
 * discarded. The on-disk copy is treated as an untrusted, possibly-corrupt
 * external record: every entry is validated individually and bad records are
 * skipped rather than crashing the whole session.
 */

export const STORAGE_KEY = 'mira.documents.v1'

function isValidRecord(raw) {
  return (
    raw &&
    typeof raw === 'object' &&
    typeof raw.id === 'string' &&
    raw.id.length > 0 &&
    typeof raw.fileName === 'string' &&
    raw.fileName.length > 0 &&
    typeof raw.savedContent === 'string'
  )
}

/**
 * Load saved document snapshots from localStorage.
 * @param {Storage} [storage=localStorage]
 * @returns {{ docs: Array<{id:string, fileName:string, savedContent:string}>, skipped: number, error: boolean }}
 */
export function loadDocuments(storage = globalThis.localStorage) {
  const empty = { docs: [], skipped: 0, error: false }
  if (!storage) return empty

  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return { ...empty, error: true }
  }
  if (!raw) return empty

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Corrupt JSON — start fresh instead of throwing.
    return { ...empty, error: true }
  }
  if (!Array.isArray(parsed)) return { ...empty, error: true }

  const docs = []
  let skipped = 0
  for (const record of parsed) {
    if (isValidRecord(record)) {
      docs.push({
        id: record.id,
        fileName: record.fileName,
        savedContent: record.savedContent
      })
    } else {
      skipped += 1
    }
  }
  return { docs, skipped, error: skipped > 0 }
}

/**
 * Persist saved document snapshots. Never throws (storage may be full/disabled).
 * @param {Array<{id:string, fileName:string, savedContent:string}>} docs
 * @param {Storage} [storage=localStorage]
 * @returns {boolean} whether the write succeeded
 */
export function saveDocuments(docs, storage = globalThis.localStorage) {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(docs))
    return true
  } catch {
    return false
  }
}
