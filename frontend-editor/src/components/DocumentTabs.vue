<template>
  <div class="tabs" @contextmenu.prevent>
    <div class="tabs__scroll">
      <button
        v-for="doc in store.documents"
        :key="doc.id"
        :class="['tab', {
          'tab--active': doc.id === store.activeId,
          'tab--dirty': isDirty(doc),
          'tab--error': doc.status === 'error'
        }]"
        :title="tabTitle(doc)"
        @click="emit('activate', doc.id)"
        @auxclick.middle.prevent="emit('close', doc.id)"
        @dblclick="startRename(doc)"
        @contextmenu="openMenu($event, doc)"
      >
        <!-- 状态图标 -->
        <span v-if="doc.status === 'loading'" class="tab__spinner" />
        <svg v-else-if="doc.status === 'error'" class="tab__icon tab__icon--error"
             width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span v-else-if="isDirty(doc)" class="tab__dot" />

        <span v-if="renamingId !== doc.id" class="tab__name">{{ doc.fileName }}</span>
        <input
          v-else
          ref="renameInput"
          v-model="renameValue"
          class="tab__input"
          @click.stop
          @keydown.enter.prevent="commitRename(doc)"
          @keydown.esc.prevent="cancelRename"
          @blur="commitRename(doc)"
        />

        <span
          class="tab__close"
          title="关闭"
          @click.stop="emit('close', doc.id)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      </button>
    </div>

    <!-- 新建 / 打开 -->
    <div class="tabs__ops">
      <button class="tabs__btn" title="新建文稿 (Ctrl+Alt+N)" @click="emit('new-doc')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button class="tabs__btn" title="批量新建 3 份" @click="emit('new-doc-batch')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="13" height="13" rx="2" />
          <path d="M8 21h11a2 2 0 0 0 2-2V8" /><line x1="7.5" y1="9.5" x2="11.5" y2="9.5" />
        </svg>
      </button>
      <button class="tabs__btn" title="打开本地文件（可多选）" @click="emit('open-docs')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>

    <!-- 右键菜单 -->
    <Transition name="menu">
      <div
        v-if="menu.visible"
        class="tabs__menu"
        :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
        @click.stop
      >
        <button class="menu__item" @click="onMenu('rename')">重命名</button>
        <button class="menu__item" @click="onMenu('close')">关闭</button>
        <button class="menu__item" :disabled="!menu.canCloseOthers" @click="onMenu('close-others')">
          关闭其他标签
        </button>
        <button class="menu__item" :disabled="!store.documents.length" @click="onMenu('close-all')">
          关闭全部标签
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { reactive, ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditorStore } from '@/stores/editor'

const store = useEditorStore()
const emit = defineEmits([
  'activate', 'close', 'close-others', 'close-all',
  'new-doc', 'new-doc-batch', 'open-docs', 'rename'
])

function isDirty(doc) {
  return doc.status === 'ready' && store.isRecordDirty(doc.id)
}

function tabTitle(doc) {
  if (doc.status === 'loading') return `${doc.fileName}（打开中…）`
  if (doc.status === 'error') return `${doc.fileName}（打开失败：${doc.error || '未知错误'}）`
  return isDirty(doc) ? `${doc.fileName}（有未保存修改）` : doc.fileName
}

// ---------- 内联重命名 ----------
const renamingId = ref(null)
const renameValue = ref('')
const renameInput = ref(null)

async function startRename(doc) {
  if (doc.status !== 'ready') return
  renamingId.value = doc.id
  // 选中文件名主干（不含扩展名）
  const dot = doc.fileName.lastIndexOf('.')
  renameValue.value = doc.fileName
  await nextTick()
  const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
  el?.focus()
  if (el && dot > 0) el.setSelectionRange(0, dot)
}

function commitRename(doc) {
  if (renamingId.value !== doc.id) return
  const value = renameValue.value
  renamingId.value = null
  if (!value.trim() || value.trim() === doc.fileName) return
  emit('rename', { id: doc.id, name: value })
}

function cancelRename() {
  renamingId.value = null
}

// ---------- 右键菜单 ----------
const menu = reactive({ visible: false, x: 0, y: 0, docId: null, canCloseOthers: false })

function openMenu(e, doc) {
  e.preventDefault()
  menu.visible = true
  menu.x = e.clientX
  menu.y = e.clientY
  menu.docId = doc.id
  menu.canCloseOthers = store.documents.length > 1
}

function closeMenu() { menu.visible = false }

function onMenu(action) {
  const id = menu.docId
  closeMenu()
  if (action === 'rename') {
    const doc = store.getRecord(id)
    if (doc) startRename(doc)
  } else if (action === 'close') {
    emit('close', id)
  } else if (action === 'close-others') {
    emit('close-others', id)
  } else if (action === 'close-all') {
    emit('close-all')
  }
}

// 任意位置 / 滚动 / 切换标签时关闭菜单
function onWindowMouseDown(e) {
  if (menu.visible && !e.target.closest('.tabs__menu')) closeMenu()
}

onMounted(() => {
  window.addEventListener('mousedown', onWindowMouseDown)
  window.addEventListener('resize', closeMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onWindowMouseDown)
  window.removeEventListener('resize', closeMenu)
})
</script>

<style lang="scss" scoped>
.tabs {
  display: flex;
  align-items: stretch;
  background: $bg;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
  user-select: none;
  position: relative;

  &__scroll {
    display: flex;
    align-items: stretch;
    flex: 1;
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }

  &__ops {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 $sp-2;
    border-left: 1px solid $border-light;
    flex-shrink: 0;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: $r-sm;
    color: $text-3;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover { background: $accent-soft; color: $accent; }
  }

  &__menu {
    position: fixed;
    z-index: $z-toast;
    min-width: 150px;
    padding: 4px;
    background: $bg-elevated;
    border: 1px solid $border;
    border-radius: $r-md;
    box-shadow: $shadow-lg;
  }
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 36px;
  border: none;
  background: transparent;
  border-right: 1px solid $border-light;
  color: $text-2;
  font-size: $fs-sm;
  font-family: $font-ui;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  max-width: 200px;
  transition: background $t-fast $ease, color $t-fast $ease;

  &:hover { background: rgba(0, 0, 0, 0.025); }

  &--active {
    background: $bg-editor;
    color: $text;
    font-weight: 500;
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

  &--error { color: $warning; }

  &__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: $accent;
    flex-shrink: 0;
  }

  &__icon--error { color: $warning; flex-shrink: 0; }

  &__spinner {
    width: 12px;
    height: 12px;
    border: 1.6px solid $border;
    border-top-color: $accent;
    border-radius: 50%;
    animation: tab-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  &__input {
    width: 120px;
    height: 22px;
    padding: 0 4px;
    border: 1px solid $accent;
    border-radius: $r-sm;
    font-size: $fs-sm;
    font-family: inherit;
    color: $text;
    outline: none;
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
    flex-shrink: 0;

    &:hover { background: $border; color: $text; }
  }

  &:hover &__close { opacity: 1; }
  &--active &__close { opacity: 1; }
  &--dirty &__close { opacity: 0.55; }
}

@keyframes tab-spin {
  to { transform: rotate(360deg); }
}

.menu__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: none;
  background: transparent;
  border-radius: $r-sm;
  font-size: $fs-sm;
  color: $text-2;
  cursor: pointer;

  &:hover:not(:disabled) { background: $accent-soft; color: $accent; }
  &:disabled { opacity: 0.4; cursor: default; }
}

.menu-enter-active,
.menu-leave-active {
  transition: opacity $t-fast $ease, transform $t-fast $ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
