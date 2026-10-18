import { onScopeDispose, ref } from 'vue'

/** Copies text and flips `copied` to true for `resetMs`, for a button that
 *  briefly confirms the copy. The reset timer is cleared with the owning
 *  component, so it never fires after unmount. */
export function useClipboard(resetMs = 1400) {
  const copied = ref(false)
  let resetTimer: number | undefined

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      clearTimeout(resetTimer)
      resetTimer = window.setTimeout(() => {
        copied.value = false
      }, resetMs)
    } catch (err) {
      console.error('Copy to clipboard failed', err)
    }
  }

  onScopeDispose(() => clearTimeout(resetTimer))

  return { copied, copy }
}
