<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string] }>()

// The draft lives here, not in App, so typing only re-renders the composer
// and not the whole message thread.
const input = ref('')

function submit() {
  const text = input.value.trim()
  if (!text || props.disabled) return
  input.value = ''
  emit('send', text)
}
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <textarea
      v-model="input"
      placeholder="Describe something to diagram…"
      rows="2"
      @keydown.enter.exact.prevent="submit"
    />
    <button type="submit" aria-label="Send" :disabled="disabled || !input.trim()">↑</button>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  align-self: center;
  width: min(48rem, calc(100% - 2.5rem));
  margin-bottom: 0.85rem;
  padding: 0.5rem 0.5rem 0.5rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 1.4rem;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.composer:focus-within {
  border-color: var(--accent);
}

.composer textarea {
  flex: 1;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  max-height: 12rem;
  padding: 0.35rem 0;
  line-height: 1.6;
}

.composer button {
  flex: none;
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
}

.composer button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.composer button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
