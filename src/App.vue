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
const copied = ref(false)

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

// The index of the most recent message that actually carries an `sfl` block
// — there is exactly one diagram per chat, not one per turn, same rule as
// sfl-chat. Kept as an index (not just the source string) so the diagram
// card's <Teleport> below knows which message row currently owns it: the
// card is built ONCE, in the DOM, and reattached to a new slot as this index
// moves — the same trick sfl-chat's own diagramCardEl reattachment plays in
// vanilla DOM — so the mounted <stickyflow-diagram>'s pan/zoom state survives
// a later reply instead of resetting every turn.
const diagramOwnerIndex = computed<number | null>(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].sfl) return i
  }
  return null
})

const currentSfl = computed<string | null>(() => {
  const owner = diagramOwnerIndex.value
  return owner === null ? null : (messages.value[owner].sfl ?? null)
})

const diagramSlotSelector = computed<string | null>(() =>
  diagramOwnerIndex.value === null ? null : `#diagram-slot-${diagramOwnerIndex.value}`
)

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

let copyResetTimer: number | null = null
/** Copies the current diagram's raw SFL source — same affordance as
 *  sfl-chat's diagram__copy-btn, minus the source-view toggle it's normally
 *  paired with there: this demo has no rendered/source switch, so the button
 *  just copies `currentSfl` directly. */
function copySfl() {
  if (!currentSfl.value) return
  navigator.clipboard.writeText(currentSfl.value).then(() => {
    copied.value = true
    if (copyResetTimer !== null) clearTimeout(copyResetTimer)
    copyResetTimer = window.setTimeout(() => { copied.value = false }, 1400)
  }).catch(err => console.error('Copy to clipboard failed', err))
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

    <div ref="messagesEl" class="scroll">
      <div class="thread">
        <div v-if="messages.length === 0" class="empty">
          <h2>What should we map?</h2>
          <p>
            Describe something to diagram — a process, a system, a decision. Ask for a change
            afterward and it edits the same diagram in place.
          </p>
        </div>

        <div v-for="(message, i) in messages" :key="i" class="message" :class="`message--${message.role}`">
          <div
            class="bubble"
            v-html="renderMarkdownToHtml(message.role === 'assistant' ? replyProse(message.content) : message.content)"
          />
          <p v-if="message.cost" class="cost">
            {{ message.cost.model }}<template v-if="message.cost.totalTokens">
              &middot; {{ message.cost.totalTokens }} tokens</template>
          </p>
          <!-- Teleport target for the single diagram card below — empty on
               every row except the one that currently owns the diagram. -->
          <div :id="`diagram-slot-${i}`" class="diagram-slot" />
        </div>

        <div v-if="loading" class="message message--assistant">
          <div class="bubble bubble--loading">Thinking…</div>
        </div>
      </div>
    </div>

    <!-- The one diagram card for this chat, built once and reattached to a
         new slot above as diagramSlotSelector moves — see diagramOwnerIndex. -->
    <Teleport v-if="diagramSlotSelector" :to="diagramSlotSelector">
      <div class="diagram">
        <stickyflow-diagram v-if="currentSfl" interactive :source="currentSfl" class="diagram__viewer" />
        <div class="diagram__bar">
          <button
            type="button"
            class="diagram__copy-btn"
            :aria-label="copied ? 'Copied' : 'Copy SFL source'"
            @click="copySfl"
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
    </Teleport>

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

/* ── Inline diagram card ────────────────────────────────────────────────
   Teleported into whichever message row currently owns it (diagramSlotSelector) —
   see the template. Same border/radius/background as sfl-chat's own .diagram. */
.diagram {
  margin-top: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  overflow: hidden;
  background: #fff;
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
