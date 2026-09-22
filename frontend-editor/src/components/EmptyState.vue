<template>
  <div class="empty">
    <div class="empty__card">
      <div class="empty__icon">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </div>
      <h2 class="empty__title">没有打开的文稿</h2>
      <p class="empty__desc">新建一篇空白文档，或从磁盘打开一个或多个 Markdown 文件。</p>
      <div class="empty__actions">
        <button class="empty__btn empty__btn--primary" @click="emit('new-doc')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          新建文档
        </button>
        <button class="empty__btn" @click="emit('open-files')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
          打开文件
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineEmits(['new-doc', 'open-files'])
</script>

<style lang="scss" scoped>
@use 'sass:color';
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-editor;
  z-index: 5;
  padding: $sp-4;

  &__card {
    text-align: center;
    max-width: 380px;
  }

  &__icon {
    width: 64px;
    height: 64px;
    margin: 0 auto $sp-4;
    border-radius: $r-lg;
    background: $accent-soft;
    color: $accent;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__title {
    font-family: $font-ui;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin-bottom: $sp-2;
  }

  &__desc {
    font-size: $fs-base;
    color: $text-3;
    line-height: 1.7;
    margin-bottom: $sp-5;
    font-family: $font-body;
  }

  &__actions {
    display: flex;
    gap: $sp-2;
    justify-content: center;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 $sp-4;
    border-radius: $r-md;
    border: 1px solid $border;
    background: $bg-elevated;
    color: $text-2;
    font-size: $fs-sm;
    font-family: $font-ui;
    font-weight: 500;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover { border-color: $accent; color: $accent; }

    &--primary {
      background: $accent;
      border-color: $accent;
      color: #fff;
      &:hover { background: color.adjust($accent, $lightness: -6%); color: #fff; }
    }
  }
}
</style>
