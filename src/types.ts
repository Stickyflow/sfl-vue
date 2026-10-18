export interface ChatMessage {
  /** Stable identity for `v-for` keys and the message's diagram slot id. */
  id: string
  role: 'user' | 'assistant'
  content: string
  /** The fenced ```sfl block extracted from an assistant reply, if it had
   *  one (see extractSfl()). Absent on user turns and on assistant turns
   *  that answered in prose only. */
  sfl?: string
  /** Set once the response lands, for the small caption under the bubble. */
  cost?: { model?: string; totalTokens?: number }
}

export interface ServerConfig {
  model?: string
  provider?: 'openai' | 'anthropic'
  baseURL?: string | null
  hasApiKey?: boolean
}
