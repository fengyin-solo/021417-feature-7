<template>
  <footer class="status">
    <template v-if="store.hasDocuments">
      <span class="status__item" :class="{ 'status__item--dirty': store.isDirty }">
        {{ store.isDirty ? '● 未保存' : '✓ 已保存' }}
      </span>
      <span class="status__sep">·</span>
      <span class="status__item">{{ store.fileName }}</span>
      <span class="status__sep">·</span>
      <span class="status__item">{{ store.statusText }}</span>
      <span class="status__sep">·</span>
      <span class="status__item">Markdown</span>
      <span class="status__sep">·</span>
      <span class="status__item">UTF-8</span>
    </template>
    <span v-else class="status__item">未打开任何文稿</span>
  </footer>
</template>

<script setup>
import { useDocumentsStore } from '@/stores/documents'
const store = useDocumentsStore()
</script>

<style lang="scss" scoped>
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  gap: $sp-2;
  background: $bg-elevated;
  border-top: 1px solid $border-light;
  flex-shrink: 0;
  padding: 0 $sp-3;

  &__item {
    font-size: $fs-xs;
    color: $text-3;
    font-family: $font-mono;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &--dirty { color: $warning; }
  }

  &__sep {
    font-size: $fs-xs;
    color: $border;
  }
}
</style>
