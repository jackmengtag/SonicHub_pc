<script setup lang="ts">
import AppIcon from './AppIcon.vue';

defineProps<{ open: boolean; title: string; width?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-layer" role="presentation" @mousedown.self="emit('close')">
        <section class="modal-card" :style="width ? { maxWidth: width } : undefined" role="dialog" aria-modal="true" :aria-label="title">
          <header class="modal-head">
            <h2>{{ title }}</h2>
            <button class="icon-btn" type="button" aria-label="关闭" @click="emit('close')"><AppIcon name="x" /></button>
          </header>
          <div class="modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
