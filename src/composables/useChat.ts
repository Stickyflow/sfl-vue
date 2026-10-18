import { computed, ref } from 'vue'
import { extractSfl } from '../lib/sfl'
import type { ChatMessage } from '../types'

export function useChat() {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // The most recent message that actually carries an `sfl` block. There is
  // exactly one diagram per chat, not one per turn, same rule as sfl-chat.
  // Exposed as the message (not just its source) so App knows which row
  // renders the diagram card.
  const diagramOwner = computed<ChatMessage | null>(() => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i].sfl) return messages.value[i]
    }
    return null
  })

  const currentSfl = computed<string | null>(() => diagramOwner.value?.sfl ?? null)

  async function send(text: string) {
    if (loading.value) return
    error.value = null
    messages.value.push({ id: crypto.randomUUID(), role: 'user', content: text })
    loading.value = true

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Only role and content go to the model; `id`, `sfl` and `cost`
          // are this app's own bookkeeping.
          messages: messages.value.map(({ role, content }) => ({ role, content })),
          currentSfl: currentSfl.value,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)

      const reply: string = data.reply
      const rawSfl = extractSfl(reply)
      // Same duplicate guard as sfl-chat (the fuller "overlap" guard, checking
      // whether new content was drawn ON TOP of existing content, is skipped
      // here; see this example's README for why): a reply that just
      // re-attaches the unchanged document, e.g. the model asking a clarifying
      // question instead of revising anything, shouldn't overwrite the
      // diagram with a byte-identical copy.
      const sfl = rawSfl && rawSfl !== currentSfl.value ? rawSfl : undefined
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        sfl,
        cost: { model: data.model, totalTokens: data.usage?.totalTokens },
      })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { messages, loading, error, diagramOwner, currentSfl, send }
}
