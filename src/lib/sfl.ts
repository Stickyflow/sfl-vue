// An SFL document opens with its version header (`sfl 1.2`) on its own first
// line. That header is what identifies SFL, not the fence's language tag,
// which models don't always bother setting correctly, and not a loose
// substring match, which a sentence like "this is valid sfl 1.2" also passes.
const SFL_HEADER = /^\s*sfl \d+\.\d+[ \t]*(?:\r?\n|$)/

// A complete fenced block, with any (or no) language tag. An unclosed fence,
// e.g. a reply cut off at the token limit, deliberately doesn't match.
const FENCE = /```[\w-]*[ \t]*\r?\n([\s\S]*?)```/g

function isSfl(text: string): boolean {
  return SFL_HEADER.test(text)
}

/** Pulls the SFL document out of a reply: the first fenced block that starts
 *  with an SFL header, or the whole reply when the model sent a bare document
 *  with no fence at all. Mirrors examples/sfl-chat's extractSfl() contract. */
export function extractSfl(reply: string): string | null {
  for (const [, body] of reply.matchAll(FENCE)) {
    if (isSfl(body)) return body.trim()
  }
  return isSfl(reply) ? reply.trim() : null
}

/** The prose around the diagram. The SFL itself is shown as the diagram, not
 *  repeated as a code block in the chat bubble; any other code block stays. */
export function replyProse(reply: string): string {
  if (isSfl(reply)) return ''
  return reply
    .replace(FENCE, (block, body: string) => (isSfl(body) ? '' : block))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
