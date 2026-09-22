/**
 * Utilities for document file names: extension handling and de-duplication.
 */

/**
 * Split a file name into its base name and extension.
 * "notes.md" -> { base: "notes", ext: ".md" }
 * "archive.tar.gz" -> { base: "archive.tar", ext: ".gz" }
 * "README" -> { base: "README", ext: "" }
 * @param {string} name
 * @returns {{ base: string, ext: string }}
 */
export function splitFileName(name) {
  const clean = (name ?? '').trim()
  const idx = clean.lastIndexOf('.')
  // No dot, or leading dot only (hidden file like ".gitignore") → no extension
  if (idx <= 0) return { base: clean, ext: '' }
  return { base: clean.slice(0, idx), ext: clean.slice(idx) }
}

/**
 * Guarantee a markdown-ish file name ends with a `.md` / `.markdown` extension.
 * @param {string} name
 * @returns {string}
 */
export function ensureMarkdownExt(name) {
  const clean = (name ?? '').trim() || 'untitled'
  return /\.(md|markdown|mdx|txt)$/i.test(clean) ? clean : `${clean}.md`
}

/**
 * Return a file name that is unique among a set of existing names.
 * Duplicates get a " (n)" suffix inserted before the extension:
 *   notes.md, notes (1).md, notes (2).md ...
 * Comparison is case-insensitive and trimmed.
 * @param {string} desired
 * @param {Iterable<string>} existingNames
 * @returns {string}
 */
export function uniqueFileName(desired, existingNames) {
  const taken = new Set(
    Array.from(existingNames, (n) => (n ?? '').trim().toLowerCase())
  )
  let candidate = ensureMarkdownExt(desired)
  if (!taken.has(candidate.toLowerCase())) return candidate

  const { base, ext } = splitFileName(candidate)
  let n = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    candidate = `${base} (${n})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
    n += 1
  }
}
