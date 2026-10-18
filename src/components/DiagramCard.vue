<script setup lang="ts">
import { useClipboard } from '../composables/useClipboard'

const props = defineProps<{ source: string }>()

// The raw SFL is never shown on the page, so copying it is the way to take
// the document elsewhere.
const { copied, copy } = useClipboard()
</script>

<template>
  <div class="diagram">
    <stickyflow-diagram interactive :source="source" class="diagram__viewer" />
    <div class="diagram__bar">
      <button
        type="button"
        class="diagram__copy-btn"
        :aria-label="copied ? 'Copied' : 'Copy SFL source'"
        @click="copy(props.source)"
      >
        <svg v-if="!copied" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="5" y="3" width="8" height="10" rx="1.4" />
          <path d="M3 5.5V13a1 1 0 0 0 1 1h6" />
        </svg>
        <svg v-else viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
        {{ copied ? 'Copied' : 'Copy SFL' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.diagram {
  margin-top: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  overflow: hidden;
  background: var(--canvas);
}

.diagram__viewer {
  display: block;
  width: 100%;
  height: 22rem;
}

.diagram__bar {
  display: flex;
  justify-content: flex-end;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.diagram__copy-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  background: none;
  padding: 0.3rem 0.55rem;
  border-radius: 0.4rem;
  font-size: 0.78rem;
  color: var(--muted);
  cursor: pointer;
}
.diagram__copy-btn:hover,
.diagram__copy-btn:focus-visible {
  outline: none;
  background: var(--accent-soft);
  color: var(--accent);
}
.diagram__copy-btn svg {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
