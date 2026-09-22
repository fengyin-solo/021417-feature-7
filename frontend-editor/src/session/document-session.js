/**
 * DocumentSession — 多文稿会话的单一事实源（框架无关）
 *
 * 不变量（任何操作后都必须成立）：
 *  I1 记录一致：activeId 与一切按 id 的操作都只能引用列表中的记录；
 *     未知 id 一律抛出且不改变任何状态（未知内容不会串改）。
 *  I2 内容隔离：每份记录的 content / savedContent 只属于该记录，
 *     切换、批量新建、批量打开都不会在记录之间复制或覆盖内容。
 *  I3 保存状态：dirty 严格等于 content !== savedContent；
 *     loading / error 记录没有未保存内容，永远不是 dirty。
 *  I4 文件名唯一：列表中任意两份记录的 fileName 不同，
 *     新建/打开时自动消歧，重名不会让两份文稿“对不上号”。
 *  I5 打开失败：失败结果保留为一条 error 记录（身份不变、内容不丢），
 *     可重试；不会被静默替换成另一份文稿。
 *  I6 连续切换：activate 同步生效，激活点始终指向被请求的记录；
 *     异步 loader 完成时若记录已被关闭，则结果作废（no-op）。
 */

export const DocStatus = Object.freeze({
  READY: 'ready',
  LOADING: 'loading',
  ERROR: 'error'
})

let seq = 0
function nextId() {
  seq += 1
  return `doc-${Date.now().toString(36)}-${seq}`
}

function normalizeName(name) {
  const trimmed = String(name == null ? '' : name).trim()
  if (!trimmed) return 'untitled.md'
  return /\.[^/\\]+$/.test(trimmed) ? trimmed : `${trimmed}.md`
}

/**
 * 批量结果：{ id, ok, reason? }，与返回顺序一一对应。
 * 调用方据此把“部分成功 / 部分失败”精确呈现给用户，绝不整体回滚或静默吞掉。
 */
export class DocumentSession {
  constructor(options = {}) {
    this._records = []
    this._activeId = null
    this._defaultContent = options.defaultContent || ''
    this._listeners = new Set()
    this._loading = new Map() // id -> token，使“记录已关闭/重试”后的旧 loader 作废
  }

  // ---------- 订阅（供 Pinia / Vue 接入，纯逻辑测试可忽略） ----------
  subscribe(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _emit() {
    for (const fn of this._listeners) {
      try { fn() } catch { /* 订阅方异常不影响会话状态 */ }
    }
  }

  // ---------- 只读视图 ----------
  getRecords() {
    // 返回浅拷贝，外部无法绕过方法直接增删；记录对象本身是唯一持有者
    return this._records.slice()
  }

  get activeId() {
    return this._activeId
  }

  getRecord(id) {
    if (id == null) return null
    return this._records.find(r => r.id === id) || null
  }

  getActiveRecord() {
    return this.getRecord(this._activeId)
  }

  isDirty(id = this._activeId) {
    const r = this.requireRecord(id)
    return r.status === DocStatus.READY && r.content !== r.savedContent
  }

  hasDirty() {
    return this._records.some(r => this.isDirty(r.id))
  }

  indexOf(id) {
    return this._records.findIndex(r => r.id === id)
  }

  // ---------- 内部工具 ----------
  requireRecord(id) {
    const r = this.getRecord(id)
    if (!r) {
      const err = new Error(`未知文稿记录: ${String(id)}`)
      err.code = 'UNKNOWN_DOCUMENT'
      throw err
    }
    return r
  }

  uniqueName(desired, exceptId = null) {
    let name = normalizeName(desired)
    const taken = () =>
      this._records.some(r => r.id !== exceptId && r.fileName.toLowerCase() === name.toLowerCase())
    if (!taken()) return name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let n = 2
    do {
      name = `${stem}-${n}${ext}`
      n += 1
    } while (taken())
    return name
  }

  _setActive(id) {
    // 仅接受列表内的 id 或 null；任何外部脏数据都进不了 activeId（I1）
    if (id != null && !this.getRecord(id)) {
      const err = new Error(`未知文稿记录: ${String(id)}`)
      err.code = 'UNKNOWN_DOCUMENT'
      throw err
    }
    if (this._activeId !== id) {
      this._activeId = id
    }
  }

  // ---------- 批量新建 ----------
  /**
   * @param {Array<{name?:string, content?:string}>} [descriptors]
   * @returns {Array<{id:string, ok:true}>} 与入参顺序一致；省略入参时新建一份
   */
  createDocuments(descriptors) {
    const list = descriptors == null ? [{}] : descriptors
    if (!Array.isArray(list)) {
      throw new TypeError('createDocuments 需要描述符数组')
    }
    const created = []
    for (const desc of list) {
      const d = desc || {}
      const hasExplicitContent = typeof d.content === 'string'
      const content = hasExplicitContent ? d.content : this._defaultContent
      const record = {
        id: nextId(),
        fileName: this.uniqueName(d.name || 'untitled.md'),
        status: DocStatus.READY,
        content,
        // null = 从未保存（新建文稿）；显式声明 saved:true 时固化为已保存版本
        savedContent: d.saved === true ? content : null,
        error: null,
        handle: d.handle != null ? d.handle : null
      }
      this._records.push(record)
      created.push({ id: record.id, ok: true, recordId: record.id })
    }
    // 批量新建后激活最后一份，符合“连续新建后当前文稿 = 最后一张标签”
    this._setActive(created[created.length - 1].id)
    this._emit()
    return created
  }

  // ---------- 批量打开（异步，逐个独立成败） ----------
  /**
   * @param {Array<{name?:string, handle?:*}>} descriptors
   * @param {(handle:*, name:string) => Promise<{content:string, name?:string}>} loader
   * @returns {Promise<Array<{id:string, ok:boolean, reason?:string}>>}
   */
  async openDocuments(descriptors, loader) {
    const list = descriptors == null ? [] : descriptors
    if (!Array.isArray(list)) throw new TypeError('openDocuments 需要描述符数组')
    if (typeof loader !== 'function') throw new TypeError('openDocuments 需要 loader 函数')

    // 第一步：同步建好占位记录并立即激活——连续打开/切换时 UI 与当前文稿立刻对应
    const entries = list.map(d => {
      const record = {
        id: nextId(),
        fileName: this.uniqueName((d && d.name) || 'untitled.md'),
        status: DocStatus.LOADING,
        content: '',
        savedContent: '',
        error: null,
        handle: (d && d.handle) != null ? d.handle : null
      }
      this._records.push(record)
      return { record }
    })
    if (entries.length) this._setActive(entries[entries.length - 1].record.id)
    this._emit()

    // 第二步：并行加载，互不阻塞；单个失败不影响其他记录
    return Promise.all(entries.map(({ record }) =>
      this._resolveLoad(record, loader)
    ))
  }

  async _resolveLoad(record, loader) {
    const token = {}
    this._loading.set(record.id, token)
    try {
      const result = await loader(record.handle, record.fileName)
      // I6: 记录在等待期间被关闭 —— 结果作废，绝不写进别的记录
      if (this._loading.get(record.id) !== token) {
        return { id: record.id, ok: false, reason: 'superseded' }
      }
      if (!result || typeof result.content !== 'string') {
        throw new Error('loader 未返回字符串内容')
      }
      record.status = DocStatus.READY
      record.content = result.content
      // 打开即视为“磁盘版本”，已保存、无未保存内容（I3）
      record.savedContent = result.content
      if (result.name) record.fileName = this.uniqueName(result.name, record.id)
      if (result.handle != null) record.handle = result.handle
      record.error = null
      this._emit()
      return { id: record.id, ok: true, recordId: record.id }
    } catch (e) {
      if (this._loading.get(record.id) !== token) {
        return { id: record.id, ok: false, reason: 'superseded' }
      }
      // I5: 身份不变（id/name 保留），状态转为 error；内容不凭空生成也不串到别处
      record.status = DocStatus.ERROR
      record.content = ''
      record.savedContent = ''
      record.error = (e && e.message) || '打开失败'
      this._emit()
      return { id: record.id, ok: false, reason: record.error }
    } finally {
      if (this._loading.get(record.id) === token) this._loading.delete(record.id)
    }
  }

  /** 重新打开失败的记录；同样不改变其 id（I5），成功后就地变为 ready */
  retryOpen(id, loader) {
    const record = this.requireRecord(id)
    if (record.status !== DocStatus.ERROR) {
      return Promise.resolve({ id, ok: false, reason: 'not-error' })
    }
    record.status = DocStatus.LOADING
    record.error = null
    this._emit()
    return this._resolveLoad(record, loader)
  }

  // ---------- 激活 / 编辑 / 改名 ----------
  activate(id) {
    this.requireRecord(id) // 未知 id：抛错且状态不变（I1）
    this._setActive(id)
    this._emit()
  }

  /**
   * 编辑当前（或指定）文稿。编辑只写入该记录的 content（I2）。
   * loading 记录尚未拥有内容，拒绝写入，避免把输入串到加载结果上。
   */
  updateContent(content, id = this._activeId) {
    const record = this.requireRecord(id)
    if (record.status !== DocStatus.READY) {
      const err = new Error(`文稿尚未就绪，无法编辑: ${record.fileName}`)
      err.code = 'NOT_READY'
      throw err
    }
    if (content !== record.content) {
      record.content = String(content)
      this._emit()
    }
  }

  /** 改名；重名按 I4 处理——allowDuplicate 为 false（默认）时抛错且不变更 */
  rename(id, newName, { autoDedupe = false } = {}) {
    const record = this.requireRecord(id)
    const name = normalizeName(newName)
    const clash = this._records.some(
      r => r.id !== id && r.fileName.toLowerCase() === name.toLowerCase()
    )
    if (clash && !autoDedupe) {
      const err = new Error(`文件名已存在: ${name}`)
      err.code = 'DUPLICATE_NAME'
      throw err
    }
    record.fileName = autoDedupe ? this.uniqueName(name, id) : name
    this._emit()
    return record.fileName
  }

  /** 保存成功：把 savedContent 固化为当前 content（I3 翻转） */
  markSaved(id = this._activeId, patch = {}) {
    const record = this.requireRecord(id)
    if (record.status !== DocStatus.READY) return
    if (typeof patch.content === 'string') record.content = patch.content
    record.savedContent = record.content
    if (patch.name) record.fileName = this.uniqueName(patch.name, record.id)
    if (patch.handle != null) record.handle = patch.handle
    this._emit()
  }

  // ---------- 关闭 ----------
  /**
   * 关闭一批记录。
   * @param {string[]} ids
   * @returns {{closedIds:string[], activeId:(string|null)}}
   * 调用方必须先自行完成“未保存保护”（保存或放弃），本方法只负责列表/当前文稿的一致性：
   * 未知 id 抛错且整体不变（I1）；被关闭记录的在途加载立即作废（I6）。
   */
  closeMany(ids) {
    const toClose = ids || []
    // 先全部校验，再统一删除——不会出现“关了一半才发现非法 id”的中间态
    for (const id of toClose) this.requireRecord(id)
    const closeSet = new Set(toClose)

    for (const id of toClose) {
      if (this._loading.has(id)) this._loading.delete(id) // 在途 loader 回来即作废
    }

    // 在删除前确定新的激活项：若当前项被关，优先选择其右侧最近的存活记录，
    // 其次向左找；列表清空则为 null。
    let nextActiveId = this._activeId
    if (closeSet.has(this._activeId)) {
      const activeIndex = this._records.findIndex(r => r.id === this._activeId)
      nextActiveId = null
      for (let step = 1; step <= this._records.length && nextActiveId === null; step++) {
        const right = this._records[activeIndex + step]
        if (right && !closeSet.has(right.id)) { nextActiveId = right.id; break }
        const left = this._records[activeIndex - step]
        if (left && !closeSet.has(left.id)) { nextActiveId = left.id; break }
      }
    }

    this._records = this._records.filter(r => !closeSet.has(r.id))
    this._setActive(nextActiveId)
    this._emit()
    return { closedIds: toClose.slice(), activeId: this._activeId }
  }

  close(id) {
    return this.closeMany([id])
  }
}
