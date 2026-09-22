/**
 * Read user-selected files from disk into text.
 *
 * Files are read independently so a failure on one (unreadable / too large /
 * encoding error) never prevents or corrupts the others — successful reads
 * keep their exact content, failed reads report an error and contribute
 * nothing to the session.
 */

/**
 * Read a single File object as UTF-8 text.
 * @param {File} file
 * @param {Object} [deps]
 * @param {function(File): Promise<string>} [deps.readAsText] - injectable reader
 * @returns {Promise<{ ok: true, name: string, content: string } | { ok: false, name: string, error: string }>}
 */
export function readFileAsText(file, deps = {}) {
  const readAsText =
    deps.readAsText ||
    ((f) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error || new Error('read error'))
        reader.readAsText(f)
      }))

  if (!file || typeof file.name !== 'string') {
    return Promise.resolve({
      ok: false,
      name: file?.name ?? 'unknown',
      error: '不是有效的文件'
    })
  }

  return readAsText(file)
    .then((content) => ({ ok: true, name: file.name, content }))
    .catch(() => ({
      ok: false,
      name: file.name,
      error: '文件读取失败'
    }))
}

/**
 * Read many files in parallel, isolating individual failures.
 * @param {File[]|FileList} files
 * @param {Object} [deps]
 * @returns {Promise<{ opened: Array<{name:string, content:string}>, failed: Array<{name:string, error:string}> }>}
 */
export async function readFilesAsText(files, deps = {}) {
  const list = Array.from(files || [])
  const results = await Promise.all(list.map((f) => readFileAsText(f, deps)))
  return {
    opened: results.filter((r) => r.ok).map((r) => ({ name: r.name, content: r.content })),
    failed: results.filter((r) => !r.ok).map((r) => ({ name: r.name, error: r.error }))
  }
}
