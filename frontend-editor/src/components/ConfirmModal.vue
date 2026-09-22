<template>
  <Transition name="modal">
    <div v-if="open" class="overlay" @click.self="$emit('cancel')">
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 class="dialog__title">{{ title }}</h3>
        <p class="dialog__body">
          {{ body }}
        </p>
        <ul v-if="names.length" class="dialog__list">
          <li v-for="n in names" :key="n" class="dialog__item">
            <span class="dialog__dot" />
            <span class="dialog__name">{{ n }}</span>
          </li>
        </ul>
        <div class="dialog__actions">
          <button class="btn btn--ghost" @click="$emit('cancel')">取消</button>
          <button class="btn btn--danger" @click="$emit('discard')">
            {{ discardLabel }}
          </button>
          <button class="btn btn--primary" @click="$emit('save')">
            保存{{ multiple ? '全部' : '' }}后关闭
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '是否保存更改？' },
  body: { type: String, default: '该文稿有尚未保存的更改，关闭后更改将丢失。' },
  names: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: false },
  discardLabel: { type: String, default: '不保存' }
})
defineEmits(['save', 'discard', 'cancel'])
</script>

<style lang="scss" scoped>
@use 'sass:color';
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-modal;
  padding: $sp-4;
}

.dialog {
  width: 100%;
  max-width: 420px;
  background: $bg-elevated;
  border-radius: $r-lg;
  box-shadow: $shadow-lg;
  padding: $sp-5;
  border: 1px solid $border-light;

  &__icon {
    width: 40px;
    height: 40px;
    border-radius: $r-full;
    background: rgba(217, 119, 6, 0.1);
    color: $warning;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $sp-3;
  }

  &__title {
    font-family: $font-ui;
    font-size: $fs-lg;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-bottom: $sp-2;
  }

  &__body {
    font-size: $fs-sm;
    color: $text-2;
    line-height: 1.7;
    margin-bottom: $sp-2;
  }

  &__list {
    list-style: none;
    max-height: 140px;
    overflow-y: auto;
    margin-bottom: $sp-4;
    border: 1px solid $border-light;
    border-radius: $r-md;
    padding: $sp-2 $sp-3;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $sp-2;
    padding: 3px 0;
    font-size: $fs-sm;
    font-family: $font-mono;
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: $warning;
    flex-shrink: 0;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: $sp-2;
    margin-top: $sp-4;
  }
}

.btn {
  height: 32px;
  padding: 0 $sp-4;
  border-radius: $r-md;
  font-size: $fs-sm;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all $t-fast $ease;
  white-space: nowrap;

  &--ghost {
    background: transparent;
    border-color: $border;
    color: $text-2;
    &:hover { background: $bg; color: $text; }
  }

  &--danger {
    background: rgba(220, 38, 38, 0.08);
    color: $error;
    &:hover { background: rgba(220, 38, 38, 0.14); }
  }

  &--primary {
    background: $accent;
    color: #fff;
    &:hover { background: color.adjust($accent, $lightness: -6%); }
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity $t-fast $ease;
  .dialog { transition: transform $t-fast $ease, opacity $t-fast $ease; }
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  .dialog { transform: translateY(8px) scale(0.98); opacity: 0; }
}
</style>
