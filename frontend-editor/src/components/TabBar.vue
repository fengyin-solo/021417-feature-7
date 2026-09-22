<template>
  <div class="tabs">
    <div class="tabs__scroll" ref="scrollEl">
      <button
        v-for="doc in store.docs"
        :key="doc.id"
        :class="['tab', { 'tab--active': doc.id === store.activeId }]"
        :title="doc.fileName"
        draggable="false"
        @click="activate(doc.id)"
        @dblclick="startRename(doc.id)"
      >
        <span class="tab__dot" :class="{ 'tab__dot--dirty': isDirty(doc) }" />
        <input
          v-if="renamingId === doc.id"
          ref="renameInput"
          v-model="renameValue"
          class="tab__input"
          spellcheck="false"
          @click.stop
          @keydown.enter.prevent="commitRename(doc.id)"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename(doc.id)"
        />
        <span v-else class="tab__name">{{ doc.fileName }}</span>
        <span
          class="tab__close"
          role="button"
          :title="'关闭 ' + doc.fileName"
          @click.stop="emit('request-close', doc.id)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      </button>
    </div>

    <div class="tabs__actions">
      <button class="icon-btn" title="新建文档 (Ctrl+N)" @click="batchNew(1)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <div class="menu-wrap">
        <button class="icon-btn" title="批量新建" @click.stop="newMenuOpen = !newMenuOpen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <Transition name="drop">
          <div v-if="newMenuOpen" class="menu">
            <button class="menu__item" @click="batchNew(1)">新建 1 篇</button>
            <button class="menu__item" @click="batchNew(3)">新建 3 篇</button>
            <button class="menu__item" @click="batchNew(5)">新建 5 篇</button>
            <button class="menu__item" @click="batchNewCustom()">自定义数量…</button>
          </div>
        </Transition>
      </div>

      <button class="icon-btn" title="打开文件（可多选）" @click="fileInput?.click()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <polyline points="10 11 7 14 10 17" /><line x1="14" y1="17" x2="17" y2="11" />
        </svg>
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain"
        class="tabs__file"
        @change="onFilePicked"
      />

      <div class="menu-wrap">
        <button class="icon-btn icon-btn--wide" title="文档操作" @click.stop="docMenuOpen = !docMenuOpen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
          </svg>
        </button>
        <Transition name="drop">
          <div v-if="docMenuOpen" class="menu menu--right">
            <button class="menu__item" :disabled="!store.activeDoc" @click="renameActive">重命名…</button>
            <button class="menu__item" :disabled="!store.activeDoc" @click="emit('request-save', store.activeId)">保存当前文档</button>
            <button class="menu__item" :disabled="!store.activeDoc" @click="exportActive">导出为 .md 文件</button>
            <div class="menu__sep" />
            <button class="menu__item" :disabled="!store.activeDoc" @click="closeOthers">关闭其他文档</button>
            <button class="menu__item" :disabled="!store.hasDocuments" @click="emit('request-close-all')">关闭全部文档</button>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useDocumentsStore } from '@/stores/documents'

const store = useDocumentsStore()
const emit = defineEmits([
  'toast',
  'request-close',
  'request-close-all',
  'request-close-others',
  'request-save',
  'request-open-files',
  'request-export'
])

const fileInput = ref(null)
const scrollEl = ref(null)

const newMenuOpen = ref(false)
const docMenuOpen = ref(false)

// ---- inline rename ----
const renamingId = ref(null)
const renameValue = ref('')
const renameInput = ref(null)

function isDirty(doc) {
  return doc.content !== doc.savedContent
}

function activate(id) {
  if (renamingId.value) return
  store.activate(id)
}

async function startRename(id) {
  renamingId.value = id
  renameValue.value = store.getDoc(id)?.fileName ?? ''
  await nextTick()
  const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
  input?.focus()
  input?.select()
}

function commitRename(id) {
  if (renamingId.value !== id) return
  const result = store.renameDocument(id, renameValue.value)
  renamingId.value = null
  if (!result.ok) {
    if (result.reason === 'duplicate') {
      emit('toast', { message: `文件名「${result.name}」已存在`, type: 'warning' })
    } else if (result.reason === 'empty') {
      emit('toast', { message: '文件名不能为空', type: 'warning' })
    }
  }
}

function cancelRename() {
  renamingId.value = null
}

function renameActive() {
  docMenuOpen.value = false
  if (store.activeId) startRename(store.activeId)
}

// ---- batch creation ----
function batchNew(n) {
  newMenuOpen.value = false
  store.newDocuments(n)
  emit('toast', { message: n > 1 ? `已新建 ${n} 篇文档` : '已新建文档', type: 'success' })
  scrollToEnd()
}

function batchNewCustom() {
  newMenuOpen.value = false
  const answer = window.prompt('要新建多少篇文档？', '3')
  if (answer === null) return
  const n = Number.parseInt(answer, 10)
  if (!Number.isFinite(n) || n <= 0) {
    emit('toast', { message: '请输入大于 0 的数字', type: 'warning' })
    return
  }
  const capped = Math.min(n, 50)
  store.newDocuments(capped)
  emit('toast', { message: `已新建 ${capped} 篇文档`, type: 'success' })
  scrollToEnd()
}

function scrollToEnd() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollLeft = scrollEl.value.scrollWidth
  })
}

// ---- open files ----
function onFilePicked(event) {
  const files = event.target.files
  if (files && files.length) emit('request-open-files', files)
  event.target.value = ''
}

/** Allow external triggers (e.g. the toolbar "打开" button) to reuse this input. */
function triggerOpen() {
  fileInput.value?.click()
}

defineExpose({ triggerOpen })

// ---- menu actions ----
function closeOthers() {
  docMenuOpen.value = false
  if (store.activeId) emit('request-close-others', store.activeId)
}

function exportActive() {
  docMenuOpen.value = false
  if (store.activeId) emit('request-export', store.activeId)
}

// close popover menus on outside click / escape
function onDocPointerDown(e) {
  if (!e.target.closest('.menu-wrap')) {
    newMenuOpen.value = false
    docMenuOpen.value = false
  }
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    newMenuOpen.value = false
    docMenuOpen.value = false
  }
}
onMounted(() => {
  document.addEventListener('mousedown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
  align-items: stretch;
  background: $bg;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
  z-index: $z-tabs;

  &__scroll {
    flex: 1;
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    &::-webkit-scrollbar { height: 3px; }
    &::-webkit-scrollbar-thumb { background: $border; }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 $sp-2;
    border-left: 1px solid $border-light;
    flex-shrink: 0;
    background: $bg-elevated;
  }

  &__file {
    display: none;
  }
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: $sp-2;
  height: 36px;
  padding: 0 $sp-3 0 $sp-3;
  border: none;
  background: transparent;
  border-right: 1px solid $border-light;
  color: $text-3;
  font-size: $fs-sm;
  font-family: $font-ui;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  flex-shrink: 0;
  transition: background $t-fast $ease, color $t-fast $ease;

  &:hover {
    color: $text-2;
    background: rgba(0, 0, 0, 0.02);
  }

  &--active {
    color: $text;
    background: $bg-editor;
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -1px;
      height: 2px;
      background: $accent;
    }
  }

  &__name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid $text-3;
    background: transparent;
    flex-shrink: 0;
    transition: all $t-fast $ease;

    &--dirty {
      border-color: transparent;
      background: $accent;
    }
  }

  &__input {
    width: 150px;
    height: 24px;
    font-size: $fs-sm;
    font-family: $font-mono;
    border: 1px solid $accent;
    border-radius: $r-sm;
    padding: 0 $sp-1;
    outline: none;
    color: $text;
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: $r-sm;
    color: $text-3;
    opacity: 0;
    transition: all $t-fast $ease;

    .tab--active & { opacity: 0.7; }
    &:hover { background: rgba(220, 38, 38, 0.12); color: $error; opacity: 1; }
  }

  &:hover &__close { opacity: 0.7; }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: $r-md;
  color: $text-3;
  cursor: pointer;
  transition: all $t-fast $ease;
  flex-shrink: 0;

  &:hover { background: $accent-soft; color: $accent; }
  &:active { transform: scale(0.92); }
  &:disabled { opacity: 0.4; cursor: default; }

  &--wide { width: 28px; }
}

.menu-wrap {
  position: relative;
}

.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: $bg-elevated;
  border: 1px solid $border-light;
  border-radius: $r-md;
  box-shadow: $shadow-lg;
  padding: 4px;
  z-index: $z-menu;

  &--right { right: 0; }

  &__item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 7px $sp-3;
    border: none;
    background: transparent;
    border-radius: $r-sm;
    font-size: $fs-sm;
    font-family: $font-ui;
    color: $text-2;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover:not(:disabled) { background: $accent-soft; color: $accent; }
    &:disabled { opacity: 0.4; cursor: default; }
  }

  &__sep {
    height: 1px;
    background: $border-light;
    margin: 4px 6px;
  }
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity $t-fast $ease, transform $t-fast $ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
