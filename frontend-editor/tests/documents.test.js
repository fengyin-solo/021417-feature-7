/**
 * Invariant tests for the multi-document session.
 *
 * Run via:  node tests/run-tests.mjs
 * The runner (run-tests.mjs) injects a localStorage mock before bundling,
 * because the persistence module reads `globalThis.localStorage` at call time.
 */
import { createPinia, setActivePinia } from 'pinia'
import { useDocumentsStore } from '@/stores/documents'
import { uniqueFileName, splitFileName, ensureMarkdownExt } from '@/utils/file-name'
import { loadDocuments, saveDocuments, STORAGE_KEY } from '@/utils/persistence'
import { readFilesAsText } from '@/utils/file-reader'

let passed = 0
let failed = 0
function assert(cond, message) {
  if (cond) {
    passed += 1
  } else {
    failed += 1
    console.error(`  ✗ FAIL: ${message}`)
  }
}
function eq(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`)
}
function section(name) {
  console.log(`\n▸ ${name}`)
}

function freshStore() {
  // Isolate tests: persistence is global, so reset the stored snapshots.
  globalThis.localStorage?.clear()
  setActivePinia(createPinia())
  const store = useDocumentsStore()
  store.init()
  return store
}

// ---------------------------------------------------------------------------
section('file name de-duplication')
{
  eq(uniqueFileName('a.md', []), 'a.md', 'first name stays as-is')
  eq(uniqueFileName('a.md', ['a.md']), 'a (1).md', 'duplicate gets (1)')
  eq(uniqueFileName('a.md', ['a.md', 'a (1).md']), 'a (2).md', 'finds next free index')
  eq(uniqueFileName('a.md', ['A.MD']), 'a (1).md', 'case-insensitive collision')
  eq(uniqueFileName('notes', ['notes.md']), 'notes (1).md', 'extension normalised before compare')
  eq(uniqueFileName('', []), 'untitled.md', 'empty name defaults to untitled.md')
  eq(uniqueFileName('log.txt', []), 'log.txt', 'keeps .txt')
  const { base, ext } = splitFileName('archive.tar.gz')
  eq(base, 'archive.tar', 'splits last extension (base)')
  eq(ext, '.gz', 'splits last extension (ext)')
  eq(ensureMarkdownExt('readme'), 'readme.md', 'adds .md when missing')
  eq(ensureMarkdownExt('x.markdown'), 'x.markdown', 'keeps .markdown')
}

// ---------------------------------------------------------------------------
section('batch creation keeps list / active / content / saved-state consistent')
{
  const store = freshStore()
  const initialCount = store.docs.length
  const ids = store.newDocuments(3)
  eq(ids.length, 3, 'three ids created')
  eq(store.docs.length, initialCount + 3, 'list grew by three')
  eq(store.activeId, ids[2], 'last created becomes active')
  for (const id of ids) {
    const doc = store.getDoc(id)
    eq(doc.content, '', 'new doc is empty')
    eq(doc.savedContent, '', 'new doc saved-snapshot empty')
    eq(store.isDocDirty(id), false, 'fresh doc is not dirty')
  }
  const names = ids.map((id) => store.getDoc(id).fileName)
  eq(new Set(names).size, names.length, 'all new names unique')
}

// ---------------------------------------------------------------------------
section('editing flips dirty flag; list / current doc / name stay aligned')
{
  const store = freshStore()
  const id = store.newDocuments(1)[0]
  store.activate(id)
  eq(store.activeDoc.id, id, 'active doc is the new doc')
  eq(store.isDirty, false, 'not dirty before edit')

  eq(store.syncContent(id, '# Hello'), true, 'syncContent returns true for known id')
  eq(store.activeDoc.content, '# Hello', 'content written to owning record')
  eq(store.fileName, store.activeDoc.fileName, 'statusbar name matches active record')
  eq(store.isDirty, true, 'dirty after edit (content != saved)')

  store.save(id)
  eq(store.isDirty, false, 'clean after save (snapshot advanced)')
  eq(store.activeDoc.savedContent, '# Hello', 'saved snapshot equals content')
}

// ---------------------------------------------------------------------------
section('rapid consecutive switching never mixes content')
{
  const store = freshStore()
  const a = store.newDocuments(['alpha.md'])[0]
  const b = store.newDocuments(['beta.md'])[0]
  const c = store.newDocuments(['gamma.md'])[0]

  store.syncContent(a, 'AAA')
  store.syncContent(b, 'BBB')
  store.syncContent(c, 'CCC')

  // Simulate a burst of switches interleaved with edits.
  store.activate(a); store.syncContent(store.activeId, 'AAA-1')
  store.activate(c); store.syncContent(store.activeId, 'CCC-1')
  store.activate(b); store.syncContent(store.activeId, 'BBB-1')
  store.activate(a); store.syncContent(store.activeId, 'AAA-2')

  eq(store.getDoc(a).content, 'AAA-2', 'alpha content intact')
  eq(store.getDoc(b).content, 'BBB-1', 'beta content intact')
  eq(store.getDoc(c).content, 'CCC-1', 'gamma content intact')
  eq(store.activeId, a, 'active is alpha')

  // Repeated activate of same id is a harmless no-op.
  eq(store.activate(a), true, 'reactivate same id ok')
  eq(store.getDoc(a).content, 'AAA-2', 'content unchanged after redundant activate')
}

// ---------------------------------------------------------------------------
section('unknown records are rejected and never alter others')
{
  const store = freshStore()
  const id = store.newDocuments(1)[0]
  store.syncContent(id, 'keep me')

  eq(store.syncContent('does-not-exist', 'HACK'), false, 'unknown sync rejected')
  eq(store.getDoc(id).content, 'keep me', 'existing content untouched after unknown write')
  eq(store.activate('nope'), false, 'activate unknown id returns false')
  eq(store.activeId, id, 'active stays on known doc after unknown activate')
  eq(store.save('nope').ok, false, 'save unknown fails')
  eq(store.renameDocument('nope', 'x.md').ok, false, 'rename unknown fails')

  const before = store.docs.length
  const res = store.closeDocuments(['ghost', id])
  eq(res.missing.includes('ghost'), true, 'ghost reported missing')
  eq(res.removed.includes(id), true, 'real doc removed')
  eq(store.docs.length, before - 1, 'only the real doc removed')
}

// ---------------------------------------------------------------------------
section('edit immediately followed by close captures latest content')
{
  const store = freshStore()
  // Start from an already-persisted document (the seeded welcome doc), which
  // has an on-disk snapshot that must be advanced to the final edit.
  const id = store.docs[0].id
  const original = store.getDoc(id).savedContent
  store.syncContent(id, 'version 1')
  store.syncContent(id, 'version 2') // last write immediately before close
  eq(store.getDoc(id).content, 'version 2', 'latest edit present')
  eq(store.isDocDirty(id), true, 'dirty, so the UI guard would prompt')

  // User chooses "save then close". At save time the disk mirror must hold
  // the FINAL edit, never a stale intermediate one.
  store.saveMany([id])
  let persisted = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
  let rec = persisted.find((d) => d.id === id)
  assert(rec, 'on-disk record exists after save')
  eq(rec.savedContent, 'version 2', 'persisted snapshot is the FINAL edit, not a stale one')
  assert(rec.savedContent !== original, 'old snapshot was overwritten, no content loss')

  // Closing removes it from the session mirror (the exported .md on real disk
  // is unaffected), but must not corrupt any other document.
  const other = store.newDocuments(1)[0]
  store.closeDocuments([id])
  eq(store.getDoc(id), null, 'document closed')
  persisted = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
  eq(persisted.find((d) => d.id === id), undefined, 'closed doc removed from session mirror')
  assert(store.getDoc(other), 'other document survives untouched')

  // A never-saved brand-new document is never persisted.
  const fresh = store.newDocuments(1)[0]
  store.syncContent(fresh, 'scratch')
  store.closeDocuments([fresh]) // discarded without saving
  const after = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY))
  eq(after.find((d) => d.id === fresh), undefined, 'unsaved scratch doc leaves no disk record')
}

// ---------------------------------------------------------------------------
section('closing clean docs moves active tab deterministically')
{
  const store = freshStore()
  const ids = store.newDocuments(['x1.md', 'x2.md', 'x3.md'])
  store.activate(ids[1])
  store.closeDocuments([ids[1]])
  eq(store.activeId, ids[2] || ids[0], 'active moves to a neighbour')
  assert(store.getDoc(store.activeId), 'active is always an existing record')

  // close all
  const all = store.docs.map((d) => d.id)
  store.closeDocuments(all)
  eq(store.docs.length, 0, 'list empty')
  eq(store.activeId, null, 'active null when empty')
  eq(store.hasDocuments, false, 'hasDocuments false')
  eq(store.isDirty, false, 'no dirty state without documents')
}

// ---------------------------------------------------------------------------
section('dirty detection is per-document')
{
  const store = freshStore()
  const a = store.newDocuments(1)[0]
  const b = store.newDocuments(1)[0]
  store.syncContent(a, 'edited')
  const dirty = store.dirtyIdsAmong([a, b])
  eq(dirty.length, 1, 'only one dirty')
  eq(dirty[0], a, 'the edited one is dirty')
  eq(store.isDocDirty(b), false, 'other doc stays clean')
}

// ---------------------------------------------------------------------------
section('rename duplicate protection')
{
  const store = freshStore()
  const a = store.newDocuments(['same.md'])[0]
  const b = store.newDocuments(['other.md'])[0]
  const ok = store.renameDocument(b, 'SAME.md')
  eq(ok.ok, false, 'case-insensitive duplicate rename rejected')
  eq(ok.reason, 'duplicate', 'reason is duplicate')
  eq(store.getDoc(b).fileName, 'other.md', 'name unchanged after rejected rename')
  const empty = store.renameDocument(b, '   ')
  eq(empty.ok, false, 'blank rename rejected')
  const good = store.renameDocument(b, 'renamed.md')
  eq(good.ok, true, 'valid rename accepted')
  eq(store.getDoc(b).fileName, 'renamed.md', 'name updated')
}

// ---------------------------------------------------------------------------
section('opening files: names de-duped, content byte-exact, failures isolated')
{
  const store = freshStore()
  const existingName = store.getDoc(store.docs[0].id).fileName
  const items = [
    { name: existingName, content: 'dup-name' },          // collides with welcome
    { name: 'report.md', content: '# Report\n\n- one\n- two' },
    { name: 'report.md', content: 'second report' },       // collides within batch
    { name: '', content: 'no name' },                      // invalid
    { name: 'broken.md', content: null },                  // unreadable
    { name: 'plain.txt', content: 'raw text body' }
  ]
  const { openedIds, rejected } = store.openDocuments(items)
  eq(openedIds.length, 4, 'four valid files opened')
  eq(rejected.length, 2, 'two records rejected')

  const names = openedIds.map((id) => store.getDoc(id).fileName)
  eq(new Set(names).size, names.length, 'opened names all unique')
  assert(names.some((n) => /\(1\)\.md$/.test(n)), 'existing name got a suffix')

  const report2 = store.getDoc(openedIds[2])
  eq(report2.content, 'second report', 'content stored byte-for-byte (no cross-over)')
  const txt = store.getDoc(openedIds[3])
  eq(txt.content, 'raw text body', 'txt content intact')
  eq(store.activeId, openedIds[3], 'last successfully opened is active')

  // Newly opened files are clean (their on-disk content == saved snapshot)
  for (const id of openedIds) eq(store.isDocDirty(id), false, 'opened file starts clean')
}

// ---------------------------------------------------------------------------
section('open-failure isolation via reader (one bad file does not lose others)')
{
  const fakeFiles = [
    { name: 'good1.md' },
    { name: 'bad.md' },
    { name: 'good2.md' }
  ]
  const deps = {
    readAsText: (file) =>
      file.name.startsWith('bad')
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(`body of ${file.name}`)
  }
  const result = await readFilesAsText(fakeFiles, deps)
  eq(result.opened.length, 2, 'two files read')
  eq(result.failed.length, 1, 'one failure isolated')
  eq(result.failed[0].name, 'bad.md', 'failure names the right file')
  eq(result.opened[0].content, 'body of good1.md', 'good content preserved')
  eq(result.opened[1].content, 'body of good2.md', 'other good content preserved')
}

// ---------------------------------------------------------------------------
section('persistence round-trip and corruption tolerance')
{
  const mem = new Map()
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v))
  }

  saveDocuments(
    [
      { id: '1', fileName: 'a.md', savedContent: 'A' },
      { id: '2', fileName: 'b.md', savedContent: 'B' }
    ],
    storage
  )
  const loaded = loadDocuments(storage)
  eq(loaded.docs.length, 2, 'both records restored')
  eq(loaded.docs[0].savedContent, 'A', 'content exact')

  // corrupt one record + bad JSON
  storage.setItem(STORAGE_KEY, JSON.stringify([
    { id: '1', fileName: 'a.md', savedContent: 'A' },
    { id: 2, fileName: 123, savedContent: 'B' } // invalid fileName
  ]))
  const partial = loadDocuments(storage)
  eq(partial.docs.length, 1, 'bad record skipped')
  eq(partial.skipped, 1, 'skipped count reported')
  eq(partial.docs[0].id, '1', 'good record survives')

  storage.setItem(STORAGE_KEY, '{not json')
  const broken = loadDocuments(storage)
  eq(broken.docs.length, 0, 'corrupt JSON → empty, no throw')
  eq(broken.error, true, 'error flagged on corrupt JSON')
}

// ---------------------------------------------------------------------------
section('save then close many: unknown ids reported, others preserved')
{
  const store = freshStore()
  const ids = store.newDocuments(3)
  ids.forEach((id, i) => store.syncContent(id, `edit ${i}`))
  const { saved, missing } = store.saveMany([...ids, 'vanished'])
  eq(saved.length, 3, 'three saved')
  eq(missing.length, 1, 'unknown id reported')
  for (const id of ids) eq(store.isDocDirty(id), false, 'all clean after save many')
  const { removed } = store.closeDocuments(ids)
  eq(removed.length, 3, 'all three closed')
}

// ---------------------------------------------------------------------------
console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
