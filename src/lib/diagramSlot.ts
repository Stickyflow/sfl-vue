/** DOM id of the empty slot under a message that the diagram card is
 *  teleported into while that message owns the diagram. */
export function diagramSlotId(messageId: string): string {
  return `diagram-slot-${messageId}`
}
