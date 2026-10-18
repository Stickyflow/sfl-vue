export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export interface CompletionRequest {
  model: string
  /** System prompt parts in order. The first is the stable primer, so a
   *  provider that supports prompt caching can cache just that prefix. */
  system: string[]
  messages: ChatTurn[]
}

export interface Completion {
  reply: string
  model: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export type Complete = (request: CompletionRequest) => Promise<Completion>
