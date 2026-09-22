<template>
  <header class="toolbar">
    <div class="toolbar__left">
      <div class="toolbar__brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span class="toolbar__name">Mira</span>
      </div>
      <span v-if="store.isDirty" class="toolbar__dot" title="有未保存的更改" />
    </div>

    <nav class="toolbar__file">
      <button class="tbtn" title="新建文档 (Ctrl+N)" @click="emit('new-doc')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        <span>新建</span>
      </button>
      <button class="tbtn" title="打开文件（可多选）" @click="emit('open-files')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>打开</span>
      </button>
      <button class="tbtn tbtn--accent" :disabled="!store.hasDocuments" title="保存 (Ctrl+S)" @click="emit('save')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        <span>保存</span>
      </button>
    </nav>

    <nav class="toolbar__actions">
      <div class="toolbar__group" v-for="(group, gi) in actionGroups" :key="gi">
        <button
          v-for="act in group"
          :key="act.id"
          class="toolbar__btn"
          :title="act.title"
          :disabled="!store.hasDocuments"
          @click="emit('action', act.id)"
          v-html="act.icon"
        />
      </div>
    </nav>

    <div class="toolbar__right">
      <span class="toolbar__filename">{{ store.fileName || '—' }}</span>
    </div>
  </header>
</template>

<script setup>
import { useDocumentsStore } from '@/stores/documents'

const store = useDocumentsStore()
const emit = defineEmits(['action', 'new-doc', 'open-files', 'save'])

const I = (d, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const actionGroups = [
  [
    { id: 'bold', title: '粗体', icon: I('<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>') },
    { id: 'italic', title: '斜体', icon: I('<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>') },
    { id: 'strikethrough', title: '删除线', icon: I('<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>') },
  ],
  [
    { id: 'code', title: '行内代码', icon: I('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>') },
    { id: 'link', title: '链接', icon: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>') },
    { id: 'image', title: '图片', icon: I('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>') },
  ],
  [
    { id: 'blockquote', title: '引用', icon: I('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>') },
    { id: 'bullet-list', title: '无序列表', icon: I('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>') },
    { id: 'ordered-list', title: '有序列表', icon: I('<line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>') },
    { id: 'hr', title: '分割线', icon: I('<line x1="2" y1="12" x2="22" y2="12"/>') },
  ],
]
</script>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $sp-3;
  height: 44px;
  padding: 0 $sp-4;
  background: $bg-elevated;
  border-bottom: 1px solid $border-light;
  user-select: none;
  flex-shrink: 0;
  z-index: $z-toolbar;

  &__left {
    display: flex;
    align-items: center;
    gap: $sp-2;
    min-width: 120px;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 6px;
    color: $text;
  }

  &__name {
    font-size: $fs-sm;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $accent;
    flex-shrink: 0;
  }

  &__file {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: $sp-1;
    flex: 1;
    justify-content: center;
    min-width: 0;
  }

  &__group {
    display: flex;
    align-items: center;
    gap: 1px;

    & + & {
      margin-left: $sp-2;
      padding-left: $sp-2;
      border-left: 1px solid $border-light;
    }
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    border-radius: $r-md;
    cursor: pointer;
    color: $text-2;
    transition: all $t-fast $ease;

    &:hover:not(:disabled) {
      background: $accent-soft;
      color: $accent;
    }
    &:active:not(:disabled) {
      transform: scale(0.93);
    }
    &:disabled { opacity: 0.35; cursor: default; }
  }

  &__right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 120px;
    max-width: 200px;
  }

  &__filename {
    font-size: $fs-xs;
    color: $text-3;
    font-family: $font-mono;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.tbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 $sp-2;
  border: none;
  background: transparent;
  border-radius: $r-md;
  font-size: $fs-xs;
  font-family: $font-ui;
  font-weight: 500;
  color: $text-2;
  cursor: pointer;
  transition: all $t-fast $ease;

  svg { flex-shrink: 0; }

  &:hover:not(:disabled) { background: $accent-soft; color: $accent; }
  &:active:not(:disabled) { transform: scale(0.94); }
  &:disabled { opacity: 0.4; cursor: default; }

  &--accent { color: $accent; }
}
</style>
