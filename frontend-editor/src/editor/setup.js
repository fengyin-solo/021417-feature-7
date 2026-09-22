import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine, dropCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { editorBaseTheme } from './theme'
import { markdownDecorationPlugin } from './decoration-plugin'
import { DEFAULT_DOC } from './default-doc'

/**
 * Build the shared list of extensions used by every document state.
 * @param {Object} [options]
 * @param {function} [options.onUpdate] - per-state update listener (bound to one document)
 * @param {Array} [options.extra] - additional extensions (e.g. keymaps)
 * @returns {Array}
 */
export function buildExtensions(options = {}) {
  const { onUpdate, extra = [] } = options

  const extensions = [
    // Core
    history(),
    drawSelection(),
    dropCursor(),
    highlightActiveLine(),
    bracketMatching(),
    EditorView.lineWrapping,

    // Keymaps
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),

    // Markdown language support (for syntax tree)
    markdown({
      base: markdownLanguage,
      codeLanguages: languages
    }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

    // Our custom theme
    editorBaseTheme,

    // The live rendering plugin
    markdownDecorationPlugin,

    // Placeholder
    EditorView.contentAttributes.of({ spellcheck: 'true' }),

    ...extra
  ]

  if (onUpdate) {
    extensions.push(EditorView.updateListener.of(onUpdate))
  }

  return extensions
}

/**
 * Create an independent EditorState for a single document.
 * Each state owns its own undo history, selection and update listener,
 * so switching between documents never mixes their contents.
 * @param {Object} [options]
 * @param {string} [options.doc=''] - Initial document content
 * @param {function} [options.onUpdate] - Callback for editor updates
 * @param {Array} [options.extra] - Additional extensions
 * @returns {EditorState}
 */
export function createEditorState(options = {}) {
  const { doc = '', onUpdate, extra } = options
  return EditorState.create({
    doc,
    extensions: buildExtensions({ onUpdate, extra })
  })
}

/**
 * Create and mount a CodeMirror 6 editor view with an initial document state.
 * @param {HTMLElement} parent - The DOM element to mount the editor into
 * @param {Object} [options]
 * @param {string} [options.doc] - Initial document content
 * @param {function} [options.onUpdate] - Callback for editor updates
 * @returns {EditorView}
 */
export function createEditor(parent, options = {}) {
  const { doc = DEFAULT_DOC, onUpdate } = options
  const state = createEditorState({ doc, onUpdate })
  return new EditorView({ state, parent })
}

export { DEFAULT_DOC }
