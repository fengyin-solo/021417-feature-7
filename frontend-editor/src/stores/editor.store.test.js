/**
 * 集成冒烟测试：Pinia store（Vue 响应式）<-> DocumentSession 联动。
 * 用 Vue 的 effectScope 直接在 Node 中运行，无需浏览器/DOM。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick } from 'vue'
import { useEditorStore } from '../stores/editor.js'
import { DocStatus } from '../session/document-session.js'

test('store：初始文稿 -> 批量新建 -> 切换 -> 编辑 -> 脏状态 -> 关闭，视图全程同指一份', async () => {
  setActivePinia(createPinia())
  const scope = effectScope()
  const store = scope.run(() => useEditorStore())

  // 初始 1 份欢迎文稿，干净
  assert.equal(store.docCount, 1)
  assert.ok(store.fileName.endsWith('.md'))
  assert.equal(store.isDirty, false)
  const initialId = store.activeId

  // 批量新建 2 份
  store.createDocuments([{ name: 'a.md', content: 'A' }, { name: 'a.md', content: 'B' }])
  await nextTick()
  assert.equal(store.docCount, 3)
  assert.deepEqual(
    store.documents.map(d => d.fileName),
    ['untitled.md', 'a.md', 'a-2.md']
  )
  // 当前文稿 = 最后新建的，列表/当前/文件名/内容四份视图一致
  assert.equal(store.fileName, 'a-2.md')
  assert.equal(store.content, 'B')
  assert.equal(store.isDirty, true)

  // 切回 a.md 编辑，不能污染 a-2.md
  store.activate(store.documents[1].id)
  await nextTick()
  assert.equal(store.fileName, 'a.md')
  assert.equal(store.content, 'A')
  store.updateContent('A-edited')
  await nextTick()
  const map = Object.fromEntries(store.documents.map(d => [d.fileName, d.content]))
  assert.deepEqual(map, { 'untitled.md': store.documents[0].content, 'a.md': 'A-edited', 'a-2.md': 'B' })

  // 保存 a.md 后只有它变干净
  store.markSaved()
  await nextTick()
  assert.equal(store.isDirty, false)
  assert.equal(store.isRecordDirty(store.documents[2].id), true)

  // 关闭当前 a.md，激活点迁移到邻居；初始文稿仍完好
  const res = store.close(store.activeId)
  await nextTick()
  assert.ok(res.activeId)
  assert.equal(store.docCount, 2)
  assert.deepEqual(store.documents.map(d => d.fileName), ['untitled.md', 'a-2.md'])
  assert.equal(store.fileName, 'a-2.md')
  assert.equal(store.content, 'B')
  assert.equal(store.isRecordDirty(initialId), false)

  // 全部关闭
  store.closeMany(store.documents.map(d => d.id))
  await nextTick()
  assert.equal(store.docCount, 0)
  assert.equal(store.activeId, null)
  assert.equal(store.fileName, '')
  assert.equal(store.content, '')
  assert.equal(store.isDirty, false)

  scope.stop()
})

test('store：打开失败的记录在响应式视图中带 error，重试成功后内容恢复', async () => {
  setActivePinia(createPinia())
  const scope = effectScope()
  const store = scope.run(() => useEditorStore())

  let attempt = 0
  const results = await store.openDocuments(
    [{ name: 'broken.md', handle: 'h' }],
    async () => {
      attempt += 1
      if (attempt === 1) throw new Error('磁盘错误')
      return { content: '恢复内容' }
    }
  )
  await nextTick()
  assert.equal(results[0].ok, false)
  assert.equal(store.activeDocument.status, DocStatus.ERROR)
  assert.equal(store.activeDocument.error, '磁盘错误')
  assert.equal(store.isDirty, false)

  const retry = await store.retryOpen(store.activeId, async () => ({ content: '恢复内容' }))
  await nextTick()
  assert.equal(retry.ok, true)
  assert.equal(store.activeDocument.status, DocStatus.READY)
  assert.equal(store.content, '恢复内容')

  scope.stop()
})
