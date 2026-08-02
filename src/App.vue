<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { renderMarkdownToHtml } from './markdown'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** The fenced ```sfl block extracted from an assistant reply, if it had
   *  one — see extractSfl(). Absent on user turns and on assistant turns
   *  that answered in prose only. */
  sfl?: string
  /** Set once the response lands, for the small caption under the bubble. */
  cost?: { model?: string; totalTokens?: number }
}

interface ServerConfig {
  model?: string
  provider?: 'openai' | 'anthropic'
  baseURL?: string | null
  hasApiKey?: boolean
}

const messages = ref<ChatMessage[]>([])
const input = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const config = ref<ServerConfig | null>(null)
const messagesEl = ref<HTMLDivElement | null>(null)

// Best-effort and non-blocking, same as sfl-chat's labelServerDefaults(): if
// /api/config isn't reachable (a static preview with no dev-server backend),
// the page just doesn't show the "no API key" banner — nothing else depends
// on this having loaded.
onMounted(async () => {
  try {
    const response = await fetch('/api/config')
    if (response.ok) config.value = await response.json()
  } catch {
    // offline/static preview
  }
})

// There is exactly one diagram per chat, not one per turn — the most recent
// message that actually carries an `sfl` block. A later reply that answers
// in prose only, or whose document got rejected as a byte-identical repeat
// (see the duplicate guard in send() below), leaves this pointing at
// whichever earlier turn last changed it, same as sfl-chat's own rule.
const currentSfl = computed<string | null>(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const sfl = messages.value[i].sfl
    if (sfl) return sfl
  }
  return null
})

/** Pulls the fenced ```sfl block out of a reply, if it has one. Mirrors
 *  examples/sfl-chat's extractSfl() — same contract, same reason to trust a
 *  block containing the `sfl 1.2` header line over the fence language tag,
 *  which models don't always bother setting correctly. */
function extractSfl(reply: string): string | null {
  const fenced = reply.match(/```(?:sfl)?\s*\n([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : reply
  return candidate.includes('sfl 1.2') ? candidate.trim() : null
}

/** The prose around the diagram — the SFL itself is shown as the diagram,
 *  not repeated as a code block in the chat bubble. */
function replyProse(reply: string): string {
  return reply.replace(/```(?:sfl)?\s*\n[\s\S]*?```/g, '').trim()
}

function scrollToBottom() {
  void nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  input.value = ''
  error.value = null
  messages.value.push({ role: 'user', content: text })
  loading.value = true
  scrollToBottom()

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Only role and content go to the model; `sfl` and `cost` are this
        // component's own bookkeeping.
        messages: messages.value.map(({ role, content }) => ({ role, content })),
        currentSfl: currentSfl.value,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)

    const reply: string = data.reply
    const rawSfl = extractSfl(reply)
    // Same duplicate guard as sfl-chat (the fuller "overlap" guard — checking
    // whether new content was drawn ON TOP of existing content — is skipped
    // here; see this example's README for why): a reply that just re-attaches
    // the unchanged document, e.g. the model asking a clarifying question
    // instead of revising anything, shouldn't overwrite the diagram with a
    // byte-identical copy.
    const sfl = rawSfl && rawSfl !== currentSfl.value ? rawSfl : undefined
    messages.value.push({
      role: 'assistant',
      content: reply,
      sfl,
      cost: { model: data.model, totalTokens: data.usage?.totalTokens },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
    scrollToBottom()
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>SFL Vue</h1>
      <p class="topbar__sub">stickyflow.js round trip — rendered via &lt;stickyflow-diagram&gt;</p>
    </header>

    <p v-if="config?.hasApiKey === false" class="banner banner--error">
      No {{ config.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY' }} on the server —
      copy .env.example to .env, add your key, and restart the dev server.
    </p>

    <main class="layout">
      <section class="chat">
        <div ref="messagesEl" class="messages">
          <p v-if="messages.length === 0" class="messages__empty">
            Describe something to diagram — a process, a system, a decision. Ask for a change afterward
            and it edits the same diagram in place.
          </p>
          <div v-for="(message, i) in messages" :key="i" class="message" :class="`message--${message.role}`">
            <div
              class="bubble"
              v-html="renderMarkdownToHtml(message.role === 'assistant' ? replyProse(message.content) : message.content)"
            />
            <p v-if="message.cost" class="cost">
              {{ message.cost.model }}<template v-if="message.cost.totalTokens">
                &middot; {{ message.cost.totalTokens }} tokens</template>
            </p>
          </div>
          <div v-if="loading" class="message message--assistant">
            <div class="bubble bubble--loading">Thinking…</div>
          </div>
        </div>

        <p v-if="error" class="banner banner--error">{{ error }}</p>

        <form class="composer" @submit.prevent="send">
          <textarea
            v-model="input"
            placeholder="Describe something to diagram…"
            rows="2"
            @keydown.enter.exact.prevent="send"
          />
          <button type="submit" aria-label="Send" :disabled="loading || !input.trim()">↑</button>
        </form>
      </section>

      <section class="canvas">
        <!-- The entire embedding: a plain custom element, `:source` bound to
             whatever the chat produced. `interactive` turns on click-to-select
             and pan/zoom (stickyflow/viewer, mounted internally by the tag) —
             there's no drag-to-edit here, because that's stickyflow/interaction,
             a tier the web component doesn't expose yet. See this repo's
             Framework Integration docs (React tab) for the JS-API pattern that
             does support editing, if you outgrow this tier. -->
        <stickyflow-diagram v-if="currentSfl" interactive :source="currentSfl" class="diagram" />
        <p v-else class="canvas__empty">Nothing to show yet — ask for a diagram.</p>
      </section>
    </main>
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

.layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  min-height: 0;
}

.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.messages__empty {
  color: var(--muted);
  font-size: 0.9rem;
}

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

/* Only the reader's own turns get a boxed treatment — the assistant's
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

.bubble--loading {
  color: var(--muted);
  font-style: italic;
}

/* Rendered markdown inside a reply — v-html content isn't compiled by the SFC,
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
.bubble :deep(h1) { font-size: 1.25em; }
.bubble :deep(h2) { font-size: 1.15em; }
.bubble :deep(h3) { font-size: 1.05em; }
.bubble :deep(h4) { font-size: 1em; }
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

.banner {
  margin: 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
}

.banner--error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  margin: 0 0.75rem 0.75rem;
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

.canvas {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 1.25rem;
}

.diagram {
  width: 100%;
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  overflow: hidden;
  background: #fff;
}

.canvas__empty {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
