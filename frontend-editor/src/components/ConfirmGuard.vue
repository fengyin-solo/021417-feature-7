<template>
  <Transition name="modal">
    <div v-if="open" class="guard" @mousedown.self="$emit('cancel')">
      <div class="guard__box" role="dialog" aria-modal="true">
        <div class="guard__head">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span class="guard__title">{{ title }}</span>
        </div>

        <p class="guard__text">
          「<strong>{{ fileName }}</strong>」有未保存的修改，关闭后改动将丢失。
        </p>
        <p v-if="positionText" class="guard__sub">{{ positionText }}</p>

        <div class="guard__actions">
          <button class="guard__btn" @click="$emit('cancel')">取消</button>
          <button class="guard__btn guard__btn--ghost" @click="$emit('discard')">
            不保存
          </button>
          <button class="guard__btn guard__btn--primary" @click="$emit('save')">
            保存后关闭
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  title: { type: String, default: '未保存的修改' },
  positionText: { type: String, default: '' }
})
defineEmits(['save', 'discard', 'cancel'])
</script>

<style lang="scss" scoped>
.guard {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: $z-toast;
  backdrop-filter: blur(2px);

  &__box {
    width: 400px;
    max-width: calc(100vw - 32px);
    background: $bg-elevated;
    border-radius: $r-lg;
    box-shadow: $shadow-lg;
    padding: $sp-5;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: $sp-2;
    color: $warning;
    margin-bottom: $sp-3;
  }

  &__title {
    font-size: $fs-base;
    font-weight: 600;
    color: $text;
  }

  &__text {
    font-size: $fs-sm;
    color: $text-2;
    line-height: 1.7;

    strong { color: $text; word-break: break-all; }
  }

  &__sub {
    margin-top: $sp-1;
    font-size: $fs-xs;
    color: $text-3;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: $sp-2;
    margin-top: $sp-5;
  }

  &__btn {
    height: 34px;
    padding: 0 $sp-4;
    border: 1px solid $border;
    background: $bg-elevated;
    border-radius: $r-md;
    font-size: $fs-sm;
    color: $text-2;
    cursor: pointer;
    transition: all $t-fast $ease;

    &:hover { border-color: $accent; color: $accent; }

    &--ghost {
      border-color: transparent;
      color: $text-3;
      &:hover { background: rgba(220, 38, 38, 0.08); border-color: transparent; color: $error; }
    }

    &--primary {
      background: $accent;
      border-color: $accent;
      color: #fff;
      &:hover { background: darken(#2563eb, 6%); color: #fff; }
    }
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity $t-normal $ease;
  .guard__box { transition: transform $t-normal $ease, opacity $t-normal $ease; }
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  .guard__box { transform: translateY(10px) scale(0.98); opacity: 0; }
}
</style>
