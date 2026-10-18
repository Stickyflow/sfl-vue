/** Pulls the fenced ```sfl block out of a reply, if it has one. Mirrors
 *  examples/sfl-chat's extractSfl(): same contract, same reason to trust a
 *  block containing the `sfl 1.2` header line over the fence language tag,
 *  which models don't always bother setting correctly. */
export function extractSfl(reply: string): string | null {
  const fenced = reply.match(/```(?:sfl)?\s*\n([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : reply
  return candidate.includes('sfl 1.2') ? candidate.trim() : null
}

/** The prose around the diagram. The SFL itself is shown as the diagram,
 *  not repeated as a code block in the chat bubble. */
export function replyProse(reply: string): string {
  return reply.replace(/```(?:sfl)?\s*\n[\s\S]*?```/g, '').trim()
}
