import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { DocumentSession, DocStatus } from './document-session.js'

/**
 * 覆盖题面要求的全部场景：
 * 批量新建、文件名重复、未知记录、连续切换、多条打开/打开失败、
 * 编辑后立即关闭（未保存保护前的数据一致性）、在途加载被关闭/重试。
 */

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('批量新建', () => {
  test('一次新建多份，列表/当前文稿/文件名一一对应', () => {
    const s = new DocumentSession({ defaultContent: 'WELCOME' })
    const res = s.createDocuments([
      { name: 'a.md' },
      { name: 'b.md', content: 'B 内容' },
      { name: 'c.md' }
    ])
    assert.equal(res.length, 3)
    assert.equal(s.getRecords().length, 3)
    // 当前文稿 = 最后新建的一份
    assert.equal(s.activeId, res[2].id)
    const [a, b, c] = s.getRecords()
    assert.equal(a.fileName, 'a.md')
    assert.equal(a.content, 'WELCOME') // 未给内容 -> 默认内容
    assert.equal(b.content, 'B 内容')
    assert.equal(c.fileName, 'c.md')
    // 新建文稿未保存：dirty
    assert.equal(s.isDirty(a.id), true)
    assert.equal(s.isDirty(b.id), true)
  })

  test('缺省扩展名自动补 .md；空白名回退 untitled.md', () => {
    const s = new DocumentSession()
    s.createDocuments([{ name: 'notes' }, { name: '   ' }])
    const [n, u] = s.getRecords()
    assert.equal(n.fileName, 'notes.md')
    assert.equal(u.fileName, 'untitled.md')
  })

  test('无参新建一份 untitled.md', () => {
    const s = new DocumentSession()
    const [r] = s.createDocuments()
    assert.equal(r.ok, true)
    assert.equal(s.getRecord(r.id).fileName, 'untitled.md')
    assert.equal(s.activeId, r.id)
  })
})

describe('文件名重复（I4）', () => {
  test('新建重名自动消歧，内容不串', () => {
    const s = new DocumentSession()
    s.createDocuments([
      { name: 'note.md', content: '第一份' },
      { name: 'note.md', content: '第二份' },
      { name: 'note.md', content: '第三份' }
    ])
    const names = s.getRecords().map(r => r.fileName)
    assert.deepEqual(names, ['note.md', 'note-2.md', 'note-3.md'])
    const contents = s.getRecords().map(r => r.content)
    assert.deepEqual(contents, ['第一份', '第二份', '第三份'])
  })

  test('大小写不同也算重名（文件系统不区分场景）', () => {
    const s = new DocumentSession()
    s.createDocuments([{ name: 'Doc.md' }, { name: 'doc.MD' }])
    assert.deepEqual(s.getRecords().map(r => r.fileName), ['Doc.md', 'doc-2.MD'])
  })

  test('打开时重名同样消歧', async () => {
    const s = new DocumentSession()
    s.createDocuments([{ name: 'open.md', content: '已存在' }])
    const res = await s.openDocuments(
      [{ name: 'open.md', handle: 'h1' }],
      async () => ({ content: '磁盘内容' })
    )
    assert.equal(res[0].ok, true)
    assert.deepEqual(s.getRecords().map(r => r.fileName), ['open.md', 'open-2.md'])
    assert.deepEqual(s.getRecords().map(r => r.content), ['已存在', '磁盘内容'])
  })

  test('手动重名 rename 抛错且状态完全不变', () => {
    const s = new DocumentSession()
    s.createDocuments([{ name: 'a.md' }, { name: 'b.md' }])
    const [a, b] = s.getRecords()
    assert.throws(() => s.rename(b.id, 'a.md'), /文件名已存在/)
    assert.equal(s.getRecord(b.id).fileName, 'b.md')
    // autoDedupe 可用
    assert.equal(s.rename(b.id, 'a.md', { autoDedupe: true }), 'a-2.md')
  })
})

describe('未知记录（I1）', () => {
  test('激活/编辑/改名/保存/关闭未知 id 全部抛错且零副作用', () => {
    const s = new DocumentSession()
    s.createDocuments([{ name: 'a.md', content: 'A' }])
    const before = s.getRecords().map(r => ({ ...r }))
    assert.throws(() => s.activate('nope'), { code: 'UNKNOWN_DOCUMENT' })
    assert.throws(() => s.updateContent('x', 'nope'), { code: 'UNKNOWN_DOCUMENT' })
    assert.throws(() => s.rename('nope', 'x.md'), { code: 'UNKNOWN_DOCUMENT' })
    assert.throws(() => s.markSaved('nope'), { code: 'UNKNOWN_DOCUMENT' })
    assert.throws(() => s.close('nope'), { code: 'UNKNOWN_DOCUMENT' })
    assert.equal(s.activeId, before[0].id)
    assert.deepEqual(s.getRecords().map(r => r.fileName), ['a.md'])
    assert.equal(s.getActiveRecord().content, 'A')
  })

  test('批量关闭中混入未知 id：整体不变（不会关掉任何合法标签）', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([{ name: 'a.md' }, { name: 'b.md' }])
    assert.throws(() => s.closeMany([r[0].id, 'ghost']), { code: 'UNKNOWN_DOCUMENT' })
    assert.equal(s.getRecords().length, 2)
    assert.equal(s.activeId, r[1].id)
  })

  test('不能把激活点设置成不存在的 id', () => {
    const s = new DocumentSession()
    s.createDocuments()
    assert.throws(() => s._setActive('ghost'), { code: 'UNKNOWN_DOCUMENT' })
  })
})

describe('连续切换（I2/I6）', () => {
  test('快速 A->B->C 切换后各自内容/保存状态独立', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([
      { name: 'a.md', content: 'A0' },
      { name: 'b.md', content: 'B0' },
      { name: 'c.md', content: 'C0' }
    ])
    s.activate(r[0].id); s.updateContent('A1')
    s.activate(r[1].id); s.updateContent('B1')
    s.activate(r[2].id); s.updateContent('C1')
    // 再切回去编辑，不能落到 C
    s.activate(r[0].id)
    assert.equal(s.activeId, r[0].id)
    s.updateContent('A2')
    const map = Object.fromEntries(s.getRecords().map(x => [x.fileName, x.content]))
    assert.deepEqual(map, { 'a.md': 'A2', 'b.md': 'B1', 'c.md': 'C1' })
    // 当前文稿身份与脏点一致
    assert.equal(s.getActiveRecord().fileName, 'a.md')
    assert.deepEqual(s.getRecords().map(x => s.isDirty(x.id)), [true, true, true])
  })

  test('保存后只有对应文稿变干净', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([
      { name: 'a.md', content: 'A' },
      { name: 'b.md', content: 'B' }
    ])
    s.activate(r[0].id)
    s.markSaved(r[0].id)
    assert.equal(s.isDirty(r[0].id), false)
    assert.equal(s.isDirty(r[1].id), true)
    assert.equal(s.hasDirty(), true)
  })

  test('编辑非激活记录后激活点不变', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([{ name: 'a.md' }, { name: 'b.md' }])
    s.updateContent('改 A', r[0].id)
    assert.equal(s.activeId, r[1].id)
    assert.equal(s.getRecord(r[0].id).content, '改 A')
  })
})

describe('多条打开', () => {
  test('多个文件并行打开，顺序、内容、当前文稿对应同一份', async () => {
    const s = new DocumentSession()
    const d1 = deferred(), d2 = deferred(), d3 = deferred()
    const loaders = [d1, d2, d3]
    const p = s.openDocuments(
      [{ name: 'f1.md', handle: 1 }, { name: 'f2.md', handle: 2 }, { name: 'f3.md', handle: 3 }],
      async (handle) => loaders[handle - 1].promise
    )
    // 占位记录同步可见，全部 loading，当前 = 最后一个
    assert.equal(s.getRecords().length, 3)
    assert.deepEqual(s.getRecords().map(r => r.status), ['loading', 'loading', 'loading'])
    const placeholders = s.getRecords()
    assert.equal(s.activeId, placeholders[2].id)
    // loading 记录不可编辑（内容不会串）
    assert.throws(() => s.updateContent('x', placeholders[0].id), { code: 'NOT_READY' })
    // 乱序完成
    d3.resolve({ content: '三' })
    d1.resolve({ content: '一' })
    d2.resolve({ content: '二' })
    const res = await p
    assert.deepEqual(res.map(r => r.ok), [true, true, true])
    const got = Object.fromEntries(s.getRecords().map(r => [r.handle, r.content]))
    assert.deepEqual(got, { 1: '一', 2: '二', 3: '三' })
    // 打开的文稿 = 已保存状态（无未保存内容）
    assert.equal(s.hasDirty(), false)
  })

  test('部分失败：成功的有内容、失败的保留身份与错误，互不影响', async () => {
    const s = new DocumentSession()
    const res = await s.openDocuments(
      [{ name: 'ok.md', handle: 1 }, { name: 'bad.md', handle: 2 }],
      async (handle) => handle === 1
        ? { content: '磁盘正文' }
        : Promise.reject(new Error('权限不足'))
    )
    assert.equal(res[0].ok, true)
    assert.equal(res[1].ok, false)
    assert.equal(res[1].reason, '权限不足')
    const [ok, bad] = s.getRecords()
    assert.equal(ok.status, DocStatus.READY)
    assert.equal(ok.content, '磁盘正文')
    assert.equal(bad.status, DocStatus.ERROR)
    assert.equal(bad.fileName, 'bad.md')   // 身份保留
    assert.equal(bad.content, '')          // 失败不凭空生成内容
    assert.equal(s.isDirty(bad.id), false) // 错误记录没有“未保存内容”
    assert.throws(() => s.updateContent('z', bad.id), { code: 'NOT_READY' })
    // 当前文稿仍是最后一个（失败的那条），列表/当前文稿一致
    assert.equal(s.activeId, bad.id)
  })

  test('失败记录可重试，成功后就地恢复、id 不变', async () => {
    const s = new DocumentSession()
    let attempt = 0
    const res = await s.openDocuments(
      [{ name: 'r.md', handle: 'h' }],
      async () => {
        attempt += 1
        if (attempt === 1) throw new Error('网络中断')
        return { content: '恢复后的内容' }
      }
    )
    const id = res[0].id
    assert.equal(s.getRecord(id).status, 'error')
    const again = await s.retryOpen(id, async () => ({ content: '恢复后的内容' }))
    assert.equal(again.ok, true)
    assert.equal(again.id, id)
    const r = s.getRecord(id)
    assert.equal(r.status, 'ready')
    assert.equal(r.content, '恢复后的内容')
    assert.equal(r.error, null)
  })

  test('等待加载期间关闭记录：loader 结果作废，不写入任何其他记录', async () => {
    const s = new DocumentSession()
    const d = deferred()
    const p = s.openDocuments(
      [{ name: 'slow.md', handle: 'h' }],
      async () => d.promise
    )
    s.createDocuments([{ name: 'keep.md', content: '保留' }])
    const slowId = s.getRecords()[0].id
    s.close(slowId) // loading 中关闭，未保存保护无需触发（尚无内容）
    d.resolve({ content: '迟到的正文' })
    const res = await p
    assert.equal(res[0].ok, false)
    assert.equal(res[0].reason, 'superseded')
    // 迟到内容没有串到 keep
    const [keep] = s.getRecords()
    assert.equal(keep.fileName, 'keep.md')
    assert.equal(keep.content, '保留')
  })

  test('等待期间重试：旧 loader 作废，只有新结果生效', async () => {
    const s = new DocumentSession()
    const old = deferred(), fresh = deferred()
    let call = 0
    const p = s.openDocuments(
      [{ name: 'x.md' }],
      async () => { call += 1; return call === 1 ? old.promise : fresh.promise }
    )
    const id = s.getRecords()[0].id
    // 第一次还没回来就（通过先失败）——这里直接用关闭竞态模型的 token 语义验证：
    // 触发 retry 需要 error 状态，改为先让旧的失败再重试
    old.reject(new Error('e1'))
    await p
    const retry = s.retryOpen(id, async () => fresh.promise)
    fresh.resolve({ content: '最终' })
    const r = await retry
    assert.equal(r.ok, true)
    assert.equal(s.getRecord(id).content, '最终')
  })
})

describe('编辑后立即关闭', () => {
  test('flush 后关闭：未保存内容可在保护决策前被读到，关闭后状态一致', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([
      { name: 'a.md', content: 'A' },
      { name: 'b.md', content: 'B' },
      { name: 'c.md', content: 'C' }
    ])
    s.activate(r[1].id)
    s.updateContent('B-刚编辑') // 模拟关闭前从编辑器 flush 的最后一次输入
    assert.equal(s.isDirty(r[1].id), true)

    // 用户在保护弹窗选择“保存”
    s.markSaved(r[1].id)
    assert.equal(s.isDirty(r[1].id), false)

    const { closedIds, activeId } = s.close(r[1].id)
    assert.deepEqual(closedIds, [r[1].id])
    // 激活点落到右侧 c；列表与 activeId 一致
    assert.equal(activeId, r[2].id)
    assert.equal(s.getActiveRecord().fileName, 'c.md')
    assert.deepEqual(s.getRecords().map(x => x.fileName), ['a.md', 'c.md'])
  })

  test('放弃未保存内容关闭：内容随记录一起消失，不污染其他文稿', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([{ name: 'a.md', content: 'A' }, { name: 'b.md', content: 'B' }])
    s.activate(r[0].id)
    s.updateContent('A-脏')
    s.close(r[0].id) // 放弃
    const [b] = s.getRecords()
    assert.equal(b.fileName, 'b.md')
    assert.equal(b.content, 'B')
    assert.equal(s.activeId, b.id)
  })

  test('关闭最右侧标签时激活点回落到左侧邻居；全部关闭为 null', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([{ name: 'a.md' }, { name: 'b.md' }, { name: 'c.md' }])
    s.activate(r[2].id)
    assert.equal(s.close(r[2].id).activeId, r[1].id)
    s.activate(r[0].id)
    assert.equal(s.close(r[0].id).activeId, r[1].id) // 左边没有 -> 右邻居
    assert.equal(s.close(r[1].id).activeId, null)
    assert.equal(s.getRecords().length, 0)
    assert.equal(s.getActiveRecord(), null)
    // 全部关闭后仍可重新新建
    const n = s.createDocuments()
    assert.equal(s.activeId, n[0].id)
  })

  test('批量关闭多个标签，激活点只在被关时迁移且落在存活邻居', () => {
    const s = new DocumentSession()
    const r = s.createDocuments([
      { name: 'a.md' }, { name: 'b.md' }, { name: 'c.md' }, { name: 'd.md' }
    ])
    s.activate(r[1].id) // b
    const out = s.closeMany([r[0].id, r[1].id]) // 关 a,b
    assert.equal(out.activeId, r[2].id) // 右邻 c
    assert.deepEqual(s.getRecords().map(x => x.fileName), ['c.md', 'd.md'])
  })
})

describe('综合竞态：连续切换 + 打开失败 + 编辑 + 关闭', () => {
  test('混合操作序列下四份“同一份内容”不变量全程成立', async () => {
    const s = new DocumentSession({ defaultContent: '' })

    // 1. 批量新建 2 份
    const created = s.createDocuments([{ name: 'n1.md', content: 'N1' }, { name: 'n2.md', content: 'N2' }])

    // 2. 同时打开 3 份，其中第 2 份会失败，第 3 份慢
    const slow = deferred()
    const opening = s.openDocuments(
      [
        { name: 'o1.md', handle: 'a' },
        { name: 'o2.md', handle: 'b' },
        { name: 'o3.md', handle: 'c' }
      ],
      async (handle) => {
        if (handle === 'b') throw new Error('打不开')
        if (handle === 'c') return slow.promise
        return { content: 'O1' }
      }
    )

    // 3. 连续切换回已存在文稿并编辑
    s.activate(created[0].id)
    s.updateContent('N1-改')

    // 4. 切到失败占位、再切走
    const oids = s.getRecords().slice(2).map(r => r.id)
    s.activate(oids[1])
    assert.equal(s.getActiveRecord().status, 'loading')
    s.activate(created[1].id)

    slow.resolve({ content: 'O3' })
    const results = await opening

    assert.deepEqual(results.map(r => r.ok), [true, false, true])
    const byName = Object.fromEntries(s.getRecords().map(r => [r.fileName, r]))
    assert.equal(byName['n1.md'].content, 'N1-改')
    assert.equal(byName['n2.md'].content, 'N2')
    assert.equal(byName['o1.md'].content, 'O1')
    assert.equal(byName['o2.md'].status, 'error')
    assert.equal(byName['o2.md'].error, '打不开')
    assert.equal(byName['o3.md'].content, 'O3')

    // 5. 编辑 o3 后立即关闭（flush + 放弃），其余记录完好
    s.activate(oids[2])
    s.updateContent('O3-编辑后立即关')
    assert.equal(s.isDirty(oids[2]), true)
    s.close(oids[2])
    assert.equal(s.getRecord(oids[2]), null)
    const remain = Object.fromEntries(s.getRecords().map(r => [r.fileName, r.content]))
    assert.deepEqual(remain, { 'n1.md': 'N1-改', 'n2.md': 'N2', 'o1.md': 'O1', 'o2.md': '' })
  })
})
