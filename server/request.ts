import type { IncomingMessage } from 'node:http'
import type { ChatTurn } from './providers/types'

const MAX_BODY_BYTES = 1_000_000

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    let size = 0
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        // Stop buffering but keep draining, so the 413 still reaches
        // the client instead of the socket closing mid-upload.
        req.off('data', onData)
        req.resume()
        reject(new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`))
        return
      }
      raw += chunk
    }
    req.on('data', onData)
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

/** The request body comes from the browser, so it's untrusted input, not a
 *  typed contract: a hand-crafted request could send `role: 'system'` to
 *  smuggle its own instructions past the primer, or extra keys the SDKs would
 *  forward. Each turn is rebuilt from just `role` and `content` after
 *  checking them. */
export function parseChatRequest(body: string): {
  messages: ChatTurn[]
  currentSfl: string | null
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new HttpError(400, 'Request body must be a JSON object')
  }
  const { messages, currentSfl } = parsed as Record<string, unknown>

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, '`messages` must be a non-empty array')
  }
  const turns = messages.map((message: unknown, i): ChatTurn => {
    const { role, content } = (
      typeof message === 'object' && message !== null ? message : {}
    ) as Record<string, unknown>
    if (role !== 'user' && role !== 'assistant') {
      throw new HttpError(400, `messages[${i}].role must be "user" or "assistant"`)
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new HttpError(400, `messages[${i}].content must be a non-empty string`)
    }
    return { role, content }
  })
  if (turns[turns.length - 1].role !== 'user') {
    throw new HttpError(400, 'The last message must be from the user')
  }

  if (currentSfl !== undefined && currentSfl !== null && typeof currentSfl !== 'string') {
    throw new HttpError(400, '`currentSfl` must be a string or null')
  }
  return { messages: turns, currentSfl: currentSfl ?? null }
}
