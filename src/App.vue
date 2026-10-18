<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppBanner from './components/AppBanner.vue'
import ChatComposer from './components/ChatComposer.vue'
import ChatMessage from './components/ChatMessage.vue'
import DiagramCard from './components/DiagramCard.vue'
import { useChat } from './composables/useChat'
import { useServerConfig } from './composables/useServerConfig'
import { diagramSlotId } from './lib/diagramSlot'

const { messages, loading, error, diagramOwner, currentSfl, send } = useChat()
const config = useServerConfig()

const scrollEl = ref<HTMLDivElement | null>(null)

// Keep the newest turn in view: after the user's message is added, and again
// once the reply (or the error) lands.
watch(
  () => [messages.value.length, loading.value],
  () => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  },
  { flush: 'post' },
)

// The diagram card is built ONCE and reattached to the owning message's slot
// as the owner moves, the same trick sfl-chat's own diagramCardEl
// reattachment plays in vanilla DOM, so the mounted <stickyflow-diagram>'s
// pan/zoom state survives a later reply instead of resetting every turn.
const diagramTarget = computed<string | null>(() =>
  diagramOwner.value ? `#${diagramSlotId(diagramOwner.value.id)}` : null
)
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>SFL Vue</h1>
      <p class="topbar__sub">stickyflow.js round trip: rendered via &lt;stickyflow-diagram&gt;</p>
    </header>

    <AppBanner v-if="config?.hasApiKey === false">
      No {{ config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY' }} on the server.
      Copy .env.example to .env, add your key, and restart the dev server.
    </AppBanner>

    <div ref="scrollEl" class="scroll">
      <div class="thread">
        <div v-if="messages.length === 0" class="empty">
          <h2>What should we map?</h2>
          <p>
            Describe something to diagram: a process, a system, a decision. Ask for a change
            afterward and it edits the same diagram in place.
          </p>
        </div>

        <ChatMessage v-for="message in messages" :key="message.id" :message="message" />

        <p v-if="loading" class="thinking">Thinking…</p>
      </div>
    </div>

    <!-- `defer` resolves the target after the rest of this render, so a slot
         rendered in the same update as the owner change already exists. -->
    <Teleport v-if="diagramTarget && currentSfl" defer :to="diagramTarget">
      <DiagramCard :source="currentSfl" />
    </Teleport>

    <AppBanner v-if="error">{{ error }}</AppBanner>

    <ChatComposer :disabled="loading" @send="send" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.topbar {
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--border);
}

.topbar h1 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.topbar__sub {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.thread {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.empty {
  padding-block: 3rem 1rem;
  text-align: center;
}

.empty h2 {
  margin: 0 0 0.6rem;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.empty p {
  margin: 0 auto;
  max-width: 30rem;
  color: var(--muted);
}

.thinking {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--muted);
  font-style: italic;
}
</style>
