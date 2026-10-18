<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdownToHtml } from '../markdown'
import { replyProse } from '../lib/sfl'
import type { ChatMessage } from '../types'

const props = defineProps<{ message: ChatMessage }>()

// A computed rather than a call in the template, so each message's markdown
// is parsed and sanitized once instead of on every re-render of the thread.
const html = computed(() =>
  renderMarkdownToHtml(
    props.message.role === 'assistant' ? replyProse(props.message.content) : props.message.content,
  ),
)

const costCaption = computed(() => {
  const cost = props.message.cost
  if (!cost) return null
  return cost.totalTokens ? `${cost.model} · ${cost.totalTokens} tokens` : cost.model
})
</script>

<template>
  <div class="message" :class="`message--${message.role}`">
    <!-- eslint-disable-next-line vue/no-v-html -- renderMarkdownToHtml parses inertly and allowlists tags/attributes -->
    <div class="bubble" v-html="html" />
    <p v-if="costCaption" class="cost">{{ costCaption }}</p>
    <!-- The diagram card, on the one message that currently owns it. -->
    <slot />
  </div>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.message--user {
  align-items: flex-end;
}

.message--assistant {
  align-items: flex-start;
}

.bubble {
  max-width: 90%;
  font-size: 0.92rem;
  line-height: 1.6;
}

/* Only the reader's own turns get a boxed treatment. The assistant's
   replies sit directly on the page, same asymmetry as sfl-chat's
   .msg--user/.msg--assistant .msg__bubble. */
.message--user .bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 1.1rem;
  padding: 0.65rem 1.05rem;
}

.message--assistant .bubble {
  max-width: 100%;
}

/* Rendered markdown inside a reply. v-html content isn't compiled by the SFC,
   so it never carries the scoped data attribute; :deep() is required for any
   of this to reach it. Same rules as sfl-chat's .msg__bubble.is-markdown. */
.bubble :deep(p) {
  margin: 0 0 0.85em;
}
.bubble :deep(p:last-child) {
  margin-bottom: 0;
}
.bubble :deep(ul),
.bubble :deep(ol) {
  margin: 0 0 0.85em;
  padding-left: 1.4em;
}
.bubble :deep(li) {
  margin: 0.2em 0;
}
.bubble :deep(h1),
.bubble :deep(h2),
.bubble :deep(h3),
.bubble :deep(h4) {
  margin: 1.2em 0 0.5em;
  font-weight: 600;
  line-height: 1.35;
}
.bubble :deep(h1) {
  font-size: 1.25em;
}
.bubble :deep(h2) {
  font-size: 1.15em;
}
.bubble :deep(h3) {
  font-size: 1.05em;
}
.bubble :deep(h4) {
  font-size: 1em;
}
.bubble :deep(code) {
  font-family: var(--mono);
  font-size: 0.86em;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.3rem;
  padding: 0.08em 0.34em;
}
.bubble :deep(pre) {
  margin: 0 0 0.85em;
  padding: 0.75rem 0.9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  overflow-x: auto;
}
.bubble :deep(pre code) {
  background: none;
  border: 0;
  padding: 0;
}

.cost {
  margin: 0.2rem 0.15rem 0;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.01em;
  color: var(--muted);
  opacity: 0.75;
}
</style>
