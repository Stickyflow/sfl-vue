import { onMounted, ref } from 'vue'
import type { ServerConfig } from '../types'

/** Best-effort and non-blocking: if
 *  /api/config isn't reachable (a static preview with no dev-server backend),
 *  this stays null and the page just doesn't show the "no API key" banner.
 *  Nothing else depends on it having loaded. */
export function useServerConfig() {
  const config = ref<ServerConfig | null>(null)

  onMounted(async () => {
    try {
      const response = await fetch('/api/config')
      if (response.ok) config.value = await response.json()
    } catch {
      // offline/static preview
    }
  })

  return config
}
