import { EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine, dropCursor } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { editorBaseTheme } from './theme'
import { markdownDecorationPlugin } from './decoration-plugin'
import { welcomeDocument } from './documents'

/**
 * 构造编辑器扩展集合（每次切换文稿都会生成一份新 State，
 * 各文稿的 undo 历史互相独立，不会串）。
 */
function buildExtensions(onUpdate) {
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
    EditorView.contentAttributes.of({ spellcheck: 'true' })
  ]

  if (onUpdate) {
    extensions.push(EditorView.updateListener.of(onUpdate))
  }
  return extensions
}

/**
 * Create and mount a CodeMirror 6 editor instance.
 * @param {HTMLElement} parent - The DOM element to mount the editor into
 * @param {Object} [options]
 * @param {string} [options.doc] - Initial document content
 * @param {function} [options.onUpdate] - Callback for editor updates
 * @returns {EditorView}
 */
export function createEditor(parent, options = {}) {
  const { doc = welcomeDocument, onUpdate } = options
  const state = EditorState.create({
    doc,
    extensions: buildExtensions(onUpdate)
  })
  return new EditorView({ state, parent })
}

/** 为某份文稿内容创建独立的 EditorState（含独立 undo 历史） */
export function createEditorState(doc, onUpdate) {
  return EditorState.create({
    doc: doc || '',
    extensions: buildExtensions(onUpdate)
  })
}
