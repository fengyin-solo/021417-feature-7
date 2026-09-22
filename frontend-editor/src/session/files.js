/**
 * 浏览器文件读写适配。
 * 优先用 File System Access API（可回写原文件）；
 * 不支持时：打开用隐藏 <input type=file multiple> + FileReader，
 * 保存降级为下载（内容不会丢，但无法回写原路径）。
 */

export const supportsFSAA = () =>
  typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'

/**
 * 弹出多选打开对话框。
 * @returns {Promise<Array<{handle?:FileSystemFileHandle, name:string}>>}
 *   用户取消时返回空数组（不是错误）。
 */
export async function pickFilesToOpen() {
  if (supportsFSAA()) {
    let handles
    try {
      handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }]
      })
    } catch (e) {
      if (e && e.name === 'AbortError') return []
      throw e
    }
    return handles.map(handle => ({ handle, name: handle.name }))
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.md,.markdown,text/markdown,text/plain'
    input.addEventListener('change', () => {
      const files = Array.from(input.files || [])
      resolve(files.map(file => ({ handle: file, name: file.name })))
    }, { once: true })
    input.click()
  })
}

/**
 * 会话 loader：从 handle 读出文本。
 * @throws 读取失败时抛出，由 DocumentSession 记为该记录的 error
 */
export async function readFileHandle(handle) {
  // File System Access API
  if (handle && typeof handle.getFile === 'function' && !(handle instanceof File)) {
    const permission = await handle.queryPermission?.({ mode: 'read' })
    if (permission === 'prompt') {
      await handle.requestPermission?.({ mode: 'read' })
    }
    const file = await handle.getFile()
    return { content: await file.text(), name: file.name, handle }
  }
  // 降级：input 拿到的 File 对象
  if (handle instanceof File) {
    return { content: await handle.text(), name: handle.name, handle }
  }
  throw new Error('没有可读取的文件句柄')
}

function downloadText(name, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 保存文稿到磁盘。
 * @returns {Promise<{savedName:string, handle?:*}>}
 *   - 有 FSAA handle：回写原文件；
 *   - 新文稿（无 handle）：showSaveFilePicker；
 *   - 不支持 FSAA：触发下载，返回原文件名。
 * @throws 用户取消保存（AbortError）时向上抛出，由调用方中止“关闭”流程
 */
export async function writeDocument(record) {
  const handle = record.handle

  if (supportsFSAA()) {
    let target = handle
    if (target instanceof File) target = null // 降级模式拿到的 File 不可回写

    if (!target || typeof target.createWritable !== 'function') {
      try {
        target = await window.showSaveFilePicker({
          suggestedName: record.fileName,
          types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }]
        })
      } catch (e) {
        if (e && e.name === 'AbortError') throw e
        throw e
      }
    } else {
      const permission = await target.queryPermission?.({ mode: 'readwrite' })
      if (permission === 'prompt') {
        const granted = await target.requestPermission?.({ mode: 'readwrite' })
        if (granted && granted !== 'granted') throw new Error('没有写入权限')
      }
    }

    const writable = await target.createWritable()
    await writable.write(record.content)
    await writable.close()
    return { savedName: target.name, handle: target }
  }

  downloadText(record.fileName, record.content)
  return { savedName: record.fileName, handle }
}
